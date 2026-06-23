"""
ai_evaluator.py — Unlimited Free AI Bridge for Job Hunter AI Agent
Uses webscout library which provides 20+ free LLM providers (no API keys needed).
Called from Node.js via execFile. Accepts JSON via stdin, returns AI response to stdout.

TESTED & VERIFIED: TypliAI, AI4Chat, AskaiFree, WiseCat, WrDoChat,
                   HeckAI, EssentialAI, PollinationsAI, FreeAI, TurboSeek
"""

import sys
import json
import traceback


def try_typli(prompt):
    from webscout import TypliAI
    bot = TypliAI(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_pollinations(prompt):
    from webscout import PollinationsAI
    bot = PollinationsAI(timeout=30)
    return str(bot.chat(prompt)).strip()

def try_ai4chat(prompt):
    from webscout import AI4Chat
    bot = AI4Chat(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_askfree(prompt):
    from webscout import AskaiFree
    bot = AskaiFree(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_wisecat(prompt):
    from webscout import WiseCat
    bot = WiseCat(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_wrdochat(prompt):
    from webscout import WrDoChat
    bot = WrDoChat(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_heckai(prompt):
    from webscout import HeckAI
    bot = HeckAI(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_essentialai(prompt):
    from webscout import EssentialAI
    bot = EssentialAI(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_freeai(prompt):
    from webscout import FreeAI
    bot = FreeAI(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_turboseek(prompt):
    from webscout import TurboSeek
    bot = TurboSeek(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_searchai(prompt):
    from webscout import SearchChatAI
    bot = SearchChatAI(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_piai(prompt):
    from webscout import PiAI
    bot = PiAI(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_sambanova(prompt):
    from webscout import Sambanova
    bot = Sambanova(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_operaaria(prompt):
    from webscout import OperaAria
    bot = OperaAria(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_akashgpt(prompt):
    from webscout import AkashGPT
    bot = AkashGPT(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()

def try_ayesoul(prompt):
    from webscout import AyeSoul
    bot = AyeSoul(is_conversation=False, timeout=30)
    return str(bot.chat(prompt)).strip()


def main():
    try:
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "No input provided"}))
            sys.exit(1)
        
        payload = json.loads(input_data)
        prompt = payload.get("prompt", "")
        system_prompt = payload.get("systemPrompt", "")
        
        if not prompt:
            print(json.dumps({"error": "Empty prompt"}))
            sys.exit(1)
        
        full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt

        # Providers ordered by reliability — only FREE ones (no API key needed)
        providers = [
            ("TypliAI", try_typli),
            ("AI4Chat", try_ai4chat),
            ("PollinationsAI", try_pollinations),
            ("AskaiFree", try_askfree),
            ("WiseCat", try_wisecat),
            ("WrDoChat", try_wrdochat),
            ("HeckAI", try_heckai),
            ("EssentialAI", try_essentialai),
            ("FreeAI", try_freeai),
            ("TurboSeek", try_turboseek),
            ("SearchChatAI", try_searchai),
            ("OperaAria", try_operaaria),
            ("AkashGPT", try_akashgpt),
            ("AyeSoul", try_ayesoul),
            ("Sambanova", try_sambanova),
            ("PiAI", try_piai),
        ]
        
        last_error = None
        for name, provider_fn in providers:
            sys.stderr.write(f"[ai4free] Trying provider: {name}...\n")
            try:
                response = provider_fn(full_prompt)
                if response and len(response) > 10:
                    print(json.dumps({
                        "success": True,
                        "provider": name,
                        "response": response
                    }))
                    sys.exit(0)
                else:
                    sys.stderr.write(f"[ai4free] {name} returned empty. Next...\n")
            except Exception as e:
                last_error = str(e)[:150]
                sys.stderr.write(f"[ai4free] {name} failed: {last_error}. Next...\n")
                continue
        
        print(json.dumps({
            "success": False,
            "error": f"All providers exhausted. Last error: {last_error}"
        }))
        sys.exit(1)
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
