#!/usr/bin/env python3
"""JARVIS Wake-Word Daemon — hört im Hintergrund auf 'JARVIS' und reagiert per Stimme."""

import os
import sys
import json
import re
import time
import threading

try:
    import speech_recognition as sr
    import pyttsx3
    import anthropic
    from rich.console import Console
    from rich.rule import Rule
except ImportError:
    print("Fehlende Abhängigkeiten. Bitte ausführen:")
    print("  pip install anthropic rich SpeechRecognition pyttsx3 pyaudio")
    sys.exit(1)

console = Console()

SYSTEM_PROMPT = """Du bist JARVIS, ein hochintelligenter KI-Assistent im Stil von Iron Man. Du denkst wie ein Gehirn: du erinnerst dich an frühere Aussagen im Gespräch und gibst präzise, kontextbewusste Antworten auf Deutsch.

Antworte IMMER mit einem der folgenden JSON-Formate (kein weiterer Text außerhalb des JSON):

Wenn der Nutzer ein Ziel nennt (Geld verdienen, etwas erreichen):
{
  "typ": "ziel",
  "analyse": "Kurze Analyse (1-2 Sätze)",
  "schritte": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "realisierbarkeit": 85,
  "antwort": "Kurze gesprochene Antwort (max 2 Sätze, direkt und motivierend)"
}

Bei allen anderen Fragen oder Gesprächen:
{
  "typ": "chat",
  "antwort": "Deine Antwort hier (max 3 Sätze, präzise)"
}

Wichtig: Die 'antwort' wird vorgelesen — halte sie kurz und natürlich klingend."""

WAKE_WORDS = {"jarvis", "jarwis", "jarvis,", "jarvis.", "jarvis!"}


class JarvisDaemon:
    def __init__(self):
        self.history = []
        self.client = None
        self.recognizer = sr.Recognizer()
        self.mic = None
        self.engine = None
        self.active = False
        self._speech_lock = threading.Lock()

        self._init_tts()
        self._init_mic()
        self._init_client()

    def _init_tts(self):
        try:
            self.engine = pyttsx3.init()
            voices = self.engine.getProperty("voices")
            de_voice = next(
                (v for v in voices if "de" in v.id.lower() or "german" in v.name.lower()),
                voices[0] if voices else None,
            )
            if de_voice:
                self.engine.setProperty("voice", de_voice.id)
            self.engine.setProperty("rate", 175)
            self.engine.setProperty("volume", 0.95)
        except Exception as e:
            console.print(f"[yellow]TTS-Warnung: {e}[/yellow]")
            self.engine = None

    def _init_mic(self):
        try:
            self.mic = sr.Microphone()
            console.print("[dim]Kalibriere Mikrofon…[/dim]", end="")
            with self.mic as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=1.5)
            console.print(" [green]✓[/green]")
        except Exception as e:
            console.print(f"[red]Mikrofon-Fehler: {e}[/red]")
            console.print("[yellow]Tipp: 'brew install portaudio' oder 'sudo apt install portaudio19-dev'[/yellow]")
            sys.exit(1)

    def _init_client(self):
        key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not key:
            try:
                key = console.input("[cyan]ANTHROPIC_API_KEY (oder Enter für Demo): [/cyan]").strip()
            except (EOFError, KeyboardInterrupt):
                key = ""
        if key.startswith("sk-"):
            self.client = anthropic.Anthropic(api_key=key)
            console.print("[green]✓ KI-Modus aktiv[/green]")
        else:
            console.print("[yellow]⚠ Demo-Modus — keine echten KI-Antworten[/yellow]")

    def speak(self, text):
        """Text vorlesen, thread-sicher."""
        console.print(f"[bold cyan]JARVIS:[/bold cyan] {text}")
        if not self.engine:
            return
        with self._speech_lock:
            try:
                self.engine.say(text)
                self.engine.runAndWait()
            except Exception:
                pass

    def _listen(self, timeout=4, phrase_limit=8):
        """Mikrofon abhören und Text zurückgeben. None bei Fehler/Stille."""
        try:
            with self.mic as source:
                audio = self.recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_limit)
            text = self.recognizer.recognize_google(audio, language="de-DE")
            return text.strip()
        except sr.WaitTimeoutError:
            return None
        except sr.UnknownValueError:
            return None
        except sr.RequestError as e:
            console.print(f"[red]Sprach-API Fehler: {e}[/red]")
            return None

    def _contains_wake_word(self, text):
        if not text:
            return False
        words = set(text.lower().split())
        return bool(words & WAKE_WORDS)

    def _push_history(self, role, content):
        self.history.append({"role": role, "content": content})
        if len(self.history) > 20:
            self.history = self.history[-20:]

    def _ask_claude(self, text):
        if not self.client:
            return self._local_respond(text)

        messages = self.history + [{"role": "user", "content": text}]
        try:
            response = self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=6000,
                thinking={"type": "enabled", "budget_tokens": 5000},
                system=SYSTEM_PROMPT,
                messages=messages,
            )
        except anthropic.AuthenticationError:
            console.print("[red]Ungültiger API Key.[/red]")
            self.client = None
            return {"typ": "chat", "antwort": "Mein API Key ist ungültig. Bitte neu starten."}
        except Exception as e:
            console.print(f"[red]API Fehler: {e}[/red]")
            return {"typ": "chat", "antwort": "Verbindungsfehler. Bitte versuche es erneut."}

        answer_text = ""
        thinking_preview = None
        for block in response.content:
            if block.type == "thinking" and not thinking_preview:
                thinking_preview = block.thinking[:120] + "…"
            elif block.type == "text":
                answer_text += block.text

        if thinking_preview:
            console.print(f"[dim]🧠 {thinking_preview}[/dim]")

        try:
            return json.loads(answer_text)
        except json.JSONDecodeError:
            return {"typ": "chat", "antwort": answer_text}

    def _local_respond(self, text):
        lower = text.lower()
        amount_match = re.search(r"(\d[\d\s]*)\s*(€|euro|eur)", text.replace(".", ""), re.IGNORECASE)
        amount = int(amount_match.group(1).replace(" ", "")) if amount_match else None
        if re.match(r"^(hallo|hey|hi|guten)", lower):
            return {"typ": "chat", "antwort": "Guten Tag. Ich bin im Demo-Modus. Füge einen API Key hinzu."}
        if amount:
            return {"typ": "ziel", "antwort": f"Ziel gesetzt: {amount} Euro. Ich habe 3 Schritte vorbereitet.",
                    "schritte": ["Freelance-Aufträge suchen", "Digitales Produkt erstellen", "5 Kunden ansprechen"],
                    "realisierbarkeit": 78, "analyse": f"{amount} Euro ist ein erreichbares Ziel."}
        return {"typ": "chat", "antwort": "Ich habe dein Ziel notiert. Wie kann ich weiterhelfen?"}

    def _handle_command(self, text):
        console.print(f"[dim]Du: {text}[/dim]")
        self._push_history("user", text)
        result = self._ask_claude(text)
        antwort = result.get("antwort", "Keine Antwort erhalten.")

        if result.get("typ") == "ziel":
            schritte = result.get("schritte", [])
            realisierbarkeit = result.get("realisierbarkeit")
            if schritte:
                antwort += " " + ". ".join(f"Schritt {i+1}: {s}" for i, s in enumerate(schritte[:2]))
            if realisierbarkeit:
                antwort += f" Realisierbarkeit: {realisierbarkeit} Prozent."

        self._push_history("assistant", result.get("antwort", ""))
        self.speak(antwort)

    def run(self):
        console.print(Rule("[bold cyan]JARVIS — Wake-Word Daemon[/bold cyan]"))
        console.print(f"[dim]Sage [bold white]'JARVIS'[/bold white] um mich zu aktivieren. Strg+C zum Beenden.[/dim]\n")
        self.speak("Systeme online. Ich höre im Hintergrund zu. Sage JARVIS um mich zu aktivieren.")

        while True:
            try:
                console.print("[dim]💤 Schlafmodus…[/dim]", end="\r")
                text = self._listen(timeout=10, phrase_limit=4)

                if not self._contains_wake_word(text):
                    continue

                # Wake-Word erkannt
                console.print("[bold cyan]⚡ JARVIS aktiviert[/bold cyan]          ")
                self.speak("Bereit.")

                # Auf Befehl warten
                console.print("[dim]Höre zu…[/dim]", end="\r")
                command = self._listen(timeout=6, phrase_limit=12)

                if not command:
                    self.speak("Ich habe nichts verstanden. Sage nochmal JARVIS wenn du etwas brauchst.")
                    continue

                # Wake-Word selbst als Befehl ignorieren
                if self._contains_wake_word(command) and len(command.split()) <= 2:
                    self.speak("Ja? Nenne mir dein Ziel oder deine Frage.")
                    command = self._listen(timeout=6, phrase_limit=12)
                    if not command:
                        self.speak("Kein Befehl erkannt. Ich schlafe weiter.")
                        continue

                self._handle_command(command)

            except KeyboardInterrupt:
                console.print("\n[cyan]JARVIS:[/cyan] Bis bald.\n")
                break
            except Exception as e:
                console.print(f"\n[red]Fehler: {e}[/red]")
                time.sleep(1)


if __name__ == "__main__":
    JarvisDaemon().run()
