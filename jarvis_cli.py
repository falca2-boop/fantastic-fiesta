#!/usr/bin/env python3
"""JARVIS Terminal Edition — KI-Assistent im Iron Man Stil."""

import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass
import json
import re

try:
    import anthropic
    from rich.console import Console
    from rich.panel import Panel
    from rich.text import Text
    from rich.rule import Rule
    from rich.spinner import Spinner
    from rich.live import Live
    from rich import print as rprint
except ImportError:
    print("Fehlende Abhängigkeiten. Bitte ausführen:")
    print("  pip install anthropic rich")
    sys.exit(1)

console = Console()

SYSTEM_PROMPT = """Du bist JARVIS, ein hochintelligenter KI-Assistent im Stil von Iron Man. Du denkst wie ein Gehirn: du erinnerst dich an frühere Aussagen im Gespräch, ziehst Schlüsse aus dem Kontext, und gibst präzise, kontextbewusste Antworten auf Deutsch.

Wenn du auf frühere Informationen aus dem Gespräch zurückgreifst, weise aktiv darauf hin (z.B. "Du hast vorhin erwähnt…").

Wenn der Nutzer ein Ziel nennt (z.B. Geld verdienen, etwas erreichen), antworte NUR mit diesem JSON (kein weiterer Text):
{
  "typ": "ziel",
  "analyse": "Kurze Analyse des Ziels (1-2 Sätze, berücksichtige den bisherigen Gesprächskontext)",
  "schritte": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "realisierbarkeit": 85,
  "antwort": "Kurze gesprochene Antwort (1-2 Sätze, direkt und motivierend)"
}
Bei normalen Fragen oder Gesprächen antworte mit:
{
  "typ": "chat",
  "antwort": "Deine Antwort hier (berücksichtige den bisherigen Gesprächskontext)"
}"""


def local_respond(text):
    """Offline-Fallback ohne API Key."""
    lower = text.lower()
    amount_match = re.search(r'(\d[\d\s]*)\s*(€|euro|eur)', text.replace('.', ''), re.IGNORECASE)
    amount = int(amount_match.group(1).replace(' ', '')) if amount_match else None

    if re.match(r'^(hallo|hey|hi|jarvis|guten)', lower):
        return {"typ": "chat", "antwort": "Guten Tag. Ich bin JARVIS im Demo-Modus. Füge einen API Key hinzu für echte KI-Antworten."}
    if amount:
        return {
            "typ": "ziel",
            "analyse": f"{amount:,} € ist ein erreichbares Ziel mit der richtigen Strategie.".replace(',', '.'),
            "schritte": [
                f"Freelance-Aufträge — ca. {-(-amount // 50)} Aufträge à 50 €",
                "Digitales Produkt erstellen und mehrfach verkaufen",
                "5 potenzielle Kunden direkt ansprechen",
            ],
            "realisierbarkeit": 78,
            "antwort": f"Ziel gesetzt: {amount:,} Euro. Ich habe 3 Schritte vorbereitet.".replace(',', '.'),
        }
    return {
        "typ": "ziel",
        "analyse": "Ziel aufgenommen.",
        "schritte": ["Ziel konkretisieren", "Ersten Schritt heute umsetzen", "Fortschritt täglich messen"],
        "realisierbarkeit": 80,
        "antwort": "Ich habe dein Ziel notiert. Sage 'plan' für die nächsten Schritte.",
    }


class JarvisCLI:
    def __init__(self):
        self.history = []
        self.current_goal = None
        self.client = None
        self._init_client()

    def _init_client(self):
        key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not key:
            console.print("\n[dim]Kein ANTHROPIC_API_KEY gefunden.[/dim]")
            try:
                key = console.input("[cyan]API Key eingeben (oder Enter für Demo-Modus): [/cyan]").strip()
            except (EOFError, KeyboardInterrupt):
                key = ""
        if key and key.startswith("sk-"):
            self.client = anthropic.Anthropic(api_key=key)
            console.print("[green]✓ API Key akzeptiert — KI-Modus aktiv[/green]")
        else:
            console.print("[yellow]⚠ Kein gültiger Key — Demo-Modus[/yellow]")

    def _push_history(self, role, content):
        self.history.append({"role": role, "content": content})
        if len(self.history) > 20:
            self.history = self.history[-20:]

    def ask(self, text):
        if not self.client:
            return local_respond(text), None

        messages = self.history + [{"role": "user", "content": text}]

        with Live(Spinner("dots", text="[cyan]Gehirn denkt…[/cyan]"), console=console, refresh_per_second=10):
            response = self.client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=6000,
                thinking={"type": "enabled", "budget_tokens": 5000},
                system=SYSTEM_PROMPT,
                messages=messages,
            )

        thinking_text = None
        answer_text = ""
        for block in response.content:
            if block.type == "thinking":
                thinking_text = block.thinking
            elif block.type == "text":
                answer_text += block.text

        try:
            parsed = json.loads(answer_text)
        except json.JSONDecodeError:
            parsed = {"typ": "chat", "antwort": answer_text}

        return parsed, thinking_text

    def display_thinking(self, thoughts):
        if not thoughts:
            return
        preview = thoughts[:400] + ("…" if len(thoughts) > 400 else "")
        console.print(Panel(
            Text(preview, style="dim italic"),
            title="[dim]🧠 Gedanken (intern)[/dim]",
            border_style="dim",
            padding=(0, 1),
        ))

    def display_response(self, result):
        typ = result.get("typ", "chat")

        if typ == "ziel":
            self.current_goal = result

            lines = []
            if result.get("analyse"):
                lines.append(Text("Analyse: ", style="cyan bold") + Text(result["analyse"]))
            if result.get("realisierbarkeit") is not None:
                lines.append(Text(f"Realisierbarkeit: {result['realisierbarkeit']}%", style="green"))
            if result.get("schritte"):
                lines.append(Text(""))
                lines.append(Text("Schritte:", style="bold white"))
                for i, s in enumerate(result["schritte"], 1):
                    lines.append(Text(f"  {i}. {s}", style="white"))

            body = Text("\n").join(lines) if lines else Text("")

            console.print(Panel(
                body,
                title=f"[bold cyan]JARVIS — Ziel gesetzt[/bold cyan]",
                border_style="cyan",
                padding=(1, 2),
            ))
            console.print(f"\n[bold cyan]JARVIS:[/bold cyan] {result.get('antwort', '')}\n")

        else:
            console.print(f"\n[bold cyan]JARVIS:[/bold cyan] {result.get('antwort', '')}\n")

    def handle_local_command(self, text):
        lower = text.lower().strip()
        if lower in ("exit", "quit", "beenden", "tschüss", "stop"):
            console.print("\n[cyan]JARVIS:[/cyan] Immer zu Diensten. Auf Wiedersehen.\n")
            sys.exit(0)
        if re.match(r'^(plan|schritte|zeig)', lower) and self.current_goal:
            schritte = self.current_goal.get("schritte", [])
            console.print("\n[bold]Dein Plan:[/bold]")
            for i, s in enumerate(schritte, 1):
                console.print(f"  [cyan]{i}.[/cyan] {s}")
            console.print()
            return True
        if re.match(r'^(status|wie weit|fortschritt)', lower):
            if self.current_goal:
                console.print(f"\n[cyan]JARVIS:[/cyan] Aktuelles Ziel: {self.current_goal.get('antwort', '(kein Ziel)')}\n")
            else:
                console.print("\n[cyan]JARVIS:[/cyan] Kein Ziel gesetzt. Nenne mir eines.\n")
            return True
        return False

    def run(self):
        console.print(Rule("[bold cyan]JARVIS — Terminal Edition[/bold cyan]"))
        console.print("[dim]Tippe dein Ziel oder eine Frage. 'exit' zum Beenden.[/dim]\n")
        console.print(f"[bold cyan]JARVIS:[/bold cyan] Systeme online. {'KI-Modus aktiv' if self.client else 'Demo-Modus'}. Wie kann ich dir heute helfen?\n")

        while True:
            try:
                user_input = console.input("[bold white]Du:[/bold white] ").strip()
            except (EOFError, KeyboardInterrupt):
                console.print("\n[cyan]JARVIS:[/cyan] Auf Wiedersehen.\n")
                break

            if not user_input:
                continue

            if self.handle_local_command(user_input):
                continue

            self._push_history("user", user_input)

            try:
                result, thinking = self.ask(user_input)
            except anthropic.AuthenticationError:
                console.print("[red]Fehler: Ungültiger API Key. Starte neu und gib einen gültigen Key ein.[/red]")
                self.client = None
                continue
            except Exception as e:
                console.print(f"[red]Verbindungsfehler: {e}[/red]")
                continue

            if thinking:
                self.display_thinking(thinking)

            self.display_response(result)
            self._push_history("assistant", result.get("antwort", ""))


if __name__ == "__main__":
    JarvisCLI().run()
