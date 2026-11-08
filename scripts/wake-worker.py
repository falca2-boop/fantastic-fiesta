#!/usr/bin/env python3
"""Wake-Word "Hey Jarvis" (openWakeWord-Modelle, läuft lokal, ohne Konto).

Liest rohes Audio (Mono, 16 kHz, 16-bit little endian) von stdin und schreibt eine Zeile "WAKE <score>",
sobald "Hey Jarvis" erkannt wurde. Audio wird nur im Arbeitsspeicher verarbeitet, nichts wird gespeichert.

Braucht nur onnxruntime und numpy; die drei Modelldateien (melspectrogram, embedding_model, hey_jarvis)
liegen im Paket "openwakeword" (ohne dessen Abhängigkeiten installiert, spart ~200 MB). Die Verarbeitung
bildet openwakeword.utils.AudioFeatures / Model.predict (Version 0.4.0) nach.
Umgebungsvariablen: WAKE_THRESHOLD (Standard 0.6), WAKE_MODELS (Ordner mit den .onnx-Dateien), WAKE_COOLDOWN (Sekunden, Standard 5)
"""
import collections
import importlib.util
import os
import sys

import numpy as np
import onnxruntime as ort

CHUNK = 1280  # 80 ms bei 16 kHz


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
        score = det.feed(np.frombuffer(data, dtype="<i2"))
        t = blocks * CHUNK / 16000
        hits = hits + 1 if score >= threshold else 0
        if hits >= 2 and t >= quiet_until:                          # zwei Blöcke in Folge über der Schwelle
            print(f"WAKE {score:.3f}", flush=True)
            quiet_until = t + cooldown
            hits = 0


if __name__ == "__main__":
    main()
