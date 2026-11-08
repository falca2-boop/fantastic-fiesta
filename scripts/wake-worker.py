#!/usr/bin/env python3
"""Wake-Word "Hey Jarvis" (openWakeWord-Modelle, läuft lokal, ohne Konto).

Liest rohes Audio (Mono, 16 kHz, 16-bit little endian) von stdin und schreibt eine Zeile "WAKE <score>",
sobald "Hey Jarvis" erkannt wurde. Audio wird nur im Arbeitsspeicher verarbeitet, nichts wird gespeichert.

Braucht nur onnxruntime und numpy; die drei Modelldateien (melspectrogram, embedding_model, hey_jarvis)
liegen im Paket "openwakeword" (ohne dessen Abhängigkeiten installiert, spart ~200 MB). Die Verarbeitung
bildet openwakeword.utils.AudioFeatures / Model.predict (Version 0.4.0) nach.
Hintergrundgeräusche: Vor der Erkennung läuft eine Rauschunterdrückung im Frequenzbereich (SpectralSuppressor): Sie schätzt
je Frequenz den gleichmäßigen Rauschpegel (Minimum der letzten 1,5 s) und dämpft alles, was nicht deutlich darüber liegt.
Das hilft bei Rauschen, Lüftern, Musik und Klicks; Fremdsprache daneben (Fernseher, Gespräche) lässt sich so nicht entfernen.
In Messungen mit Sprachausgabe plus Störgeräuschen stieg die Erkennungsrate bei weißem Rauschen von 57 auf 100 % (20 dB Abstand).
Umgebungsvariablen: WAKE_THRESHOLD (Standard 0.6), WAKE_MODELS (Ordner mit den .onnx-Dateien), WAKE_COOLDOWN (Sekunden, Standard 5),
WAKE_DENOISE (1 = Rauschunterdrückung an, Standard; 0 = aus), WAKE_DENOISE_FLOOR / WAKE_DENOISE_BIAS (Stärke)
"""
import collections
import importlib.util
import os
import sys

import numpy as np
import onnxruntime as ort

CHUNK = 1280  # 80 ms bei 16 kHz
DENOISE_FLOOR = float(os.environ.get('WAKE_DENOISE_FLOOR', '0.15'))   # kleinste Restverstärkung (0.15 = höchstens -16 dB Dämpfung)
DENOISE_BIAS = float(os.environ.get('WAKE_DENOISE_BIAS', '2.0'))      # Schätzfaktor für den Rauschpegel (höher = stärker)


def models_dir():
    d = os.environ.get("WAKE_MODELS")
    if d:
        return d
    spec = importlib.util.find_spec("openwakeword")          # nur suchen, nicht importieren (das würde scikit-learn verlangen)
    if spec is None or not spec.submodule_search_locations:
        sys.exit("ERROR: Paket openwakeword nicht installiert (pip install --no-deps openwakeword==0.4.0)")
    return os.path.join(list(spec.submodule_search_locations)[0], "resources", "models")


def session(path):
    o = ort.SessionOptions()
    o.inter_op_num_threads = 1
    o.intra_op_num_threads = 1
    return ort.InferenceSession(path, sess_options=o, providers=["CPUExecutionProvider"])


class SpectralSuppressor:
    """Streaming-Rauschunterdrückung: STFT (512, 50 % Überlappung, sqrt-Hann), Rauschpegel je Frequenz als Minimum der
    geglätteten Leistung über ~1,5 s, Wiener-Verstärkung mit Untergrenze, Verstärkung zeitlich geglättet.
    Ein Block von 1280 Samples ergibt genau 5 Schritte; die Ausgabe ist um 256 Samples (16 ms) verzögert."""
    N, H = 512, 256

    def __init__(self, floor=DENOISE_FLOOR, bias=DENOISE_BIAS, history=96):
        self.floor, self.bias = floor, bias
        self.win = np.sqrt(np.hanning(self.N + 1)[:-1])
        self.inbuf = np.zeros(self.N - self.H)
        self.outbuf = np.zeros(self.N - self.H)
        self.smooth = None
        self.hist = collections.deque(maxlen=history)
        self.gain = None

    def process(self, x):
        x = np.asarray(x, dtype=np.float64)
        out = []
        for h in range(len(x) // self.H):
            frame = np.concatenate([self.inbuf, x[h * self.H:(h + 1) * self.H]])
            self.inbuf = frame[self.H:]
            X = np.fft.rfft(frame * self.win)
            P = np.abs(X) ** 2
            self.smooth = P if self.smooth is None else 0.8 * self.smooth + 0.2 * P
            self.hist.append(self.smooth)
            noise = np.min(self.hist, axis=0) * self.bias + 1e-9
            snr = np.maximum(P / noise - 1, 0)
            g = np.maximum(snr / (snr + 1), self.floor)
            self.gain = g if self.gain is None else 0.5 * self.gain + 0.5 * g
            y = np.fft.irfft(X * self.gain, self.N) * self.win
            out.append(self.outbuf + y[:self.H])
            self.outbuf = y[self.H:]
        return np.concatenate(out) if out else np.zeros(0)


class Detector:
    def __init__(self, folder):
        self.mel = session(os.path.join(folder, "melspectrogram.onnx"))
        self.emb = session(os.path.join(folder, "embedding_model.onnx"))
        self.wake = session(os.path.join(folder, "hey_jarvis_v0.1.onnx"))
        self.wake_in = self.wake.get_inputs()[0].name
        self.frames = self.wake.get_inputs()[0].shape[1]              # 16 Embedding-Frames
        self.raw = collections.deque(maxlen=16000 * 10)
        self.mel_buf = np.ones((76, 32))
        self.acc = 0
        zeros = np.zeros(160000, dtype=np.int16)
        spec = self.melspec(zeros)
        windows = [spec[i:i + 76] for i in range(0, spec.shape[0], 8) if spec[i:i + 76].shape[0] == 76]
        batch = np.expand_dims(np.array(windows), axis=-1).astype(np.float32)
        self.features = self.emb.run(None, {"input_1": batch})[0].squeeze()
        self.history = 0

    def melspec(self, samples):
        x = np.asarray(samples, dtype=np.float32)[None, :]
        return np.squeeze(self.mel.run(None, {"input": x})[0]) / 10 + 2

    def feed(self, chunk):
        """chunk: int16-Array (1280 Samples). Gibt den Score 0..1 zurück."""
        self.raw.extend(chunk.tolist())
        self.acc += len(chunk)
        if self.acc >= CHUNK:
            tail = list(self.raw)[-self.acc - 160 * 3:]
            self.mel_buf = np.vstack((self.mel_buf, self.melspec(tail)))
            if self.mel_buf.shape[0] > 970:
                self.mel_buf = self.mel_buf[-970:, :]
            for i in np.arange(self.acc // CHUNK - 1, -1, -1):
                ndx = -8 * i
                ndx = ndx if ndx != 0 else len(self.mel_buf)
                x = self.mel_buf[-76 + ndx:ndx].astype(np.float32)[None, :, :, None]
                if x.shape[1] == 76:
                    self.features = np.vstack((self.features, self.emb.run(None, {"input_1": x})[0].squeeze()))
            self.acc = 0
        if self.features.shape[0] > 120:
            self.features = self.features[-120:, :]
        feats = self.features[-self.frames:][None, :, :].astype(np.float32)
        score = float(self.wake.run(None, {self.wake_in: feats})[0][0][0])
        self.history += 1
        return 0.0 if self.history < 5 else score                   # die ersten Blöcke sind unzuverlässig


def main():
    threshold = float(os.environ.get("WAKE_THRESHOLD", "0.6"))
    cooldown = float(os.environ.get("WAKE_COOLDOWN", "5"))
    det = Detector(models_dir())
    denoise = SpectralSuppressor() if os.environ.get("WAKE_DENOISE", "1") != "0" else None
    print("READY", flush=True)
    stdin = sys.stdin.buffer
    hits, quiet_until, blocks = 0, 0, 0
    while True:
        data = b""
        while len(data) < CHUNK * 2:
            part = stdin.read(CHUNK * 2 - len(data))
            if not part:
                return
            data += part
        blocks += 1
        audio = np.frombuffer(data, dtype="<i2")
        if denoise is not None:
            audio = np.clip(denoise.process(audio), -32768, 32767).astype("<i2")
        score = det.feed(audio)
        t = blocks * CHUNK / 16000
        hits = hits + 1 if score >= threshold else 0
        if hits >= 2 and t >= quiet_until:                          # zwei Blöcke in Folge über der Schwelle
            print(f"WAKE {score:.3f}", flush=True)
            quiet_until = t + cooldown
            hits = 0


if __name__ == "__main__":
    main()
