"""VARUNA Voice Engine for WhatsApp Audio Notes.

Handles:
1. Downloading voice note audio (.ogg/.mp4/.amr) from Twilio MediaUrl using Twilio credentials.
2. Converting audio to .wav using ffmpeg (if available on the system).
3. Transcribing audio to Tamil/English text using Groq Whisper API (primary free choice)
   or OpenAI Whisper API / local Whisper (as fallbacks).
4. Returning clean transcribed text to the WhatsApp webhook handler.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Union

import requests

logger = logging.getLogger("varuna.voice_engine")


def download_twilio_media(
    media_url: str,
    twilio_sid: Optional[str] = None,
    twilio_token: Optional[str] = None,
    dest_path: Optional[Path] = None,
) -> Path:
    """Download audio file from Twilio MediaUrl to local temporary storage.

    Twilio media URLs typically require Twilio HTTP Basic Authentication unless
    public access is enabled.
    """
    sid = twilio_sid or os.getenv("TWILIO_ACCOUNT_SID") or os.getenv("TWILIO_SID")
    token = twilio_token or os.getenv("TWILIO_AUTH_TOKEN") or os.getenv("TWILIO_TOKEN")

    auth = (sid, token) if (sid and token) else None

    # Detect extension from URL or default to .ogg
    suffix = ".ogg"
    if ".mp4" in media_url.lower():
        suffix = ".mp4"
    elif ".wav" in media_url.lower():
        suffix = ".wav"
    elif ".mp3" in media_url.lower():
        suffix = ".mp3"

    if dest_path is None:
        temp_dir = Path(tempfile.gettempdir())
        dest_path = temp_dir / f"varuna_voice_{uuid.uuid4().hex}{suffix}"

    logger.info("Downloading Twilio voice note from %s...", media_url)
    resp = requests.get(media_url, auth=auth, timeout=25)

    # If auth failed (e.g. 401), try once without auth in case URL is a pre-signed S3 link
    if resp.status_code == 401 and auth is not None:
        logger.warning("Twilio auth returned 401; retrying without auth headers...")
        resp = requests.get(media_url, timeout=25)

    resp.raise_for_status()

    with open(dest_path, "wb") as f:
        f.write(resp.content)

    logger.info("Downloaded audio note (%d bytes) to %s", len(resp.content), dest_path)
    return dest_path


def convert_to_wav(input_path: Path) -> Path:
    """Convert input audio file (.ogg/.mp4/.amr) to standard 16kHz mono WAV using ffmpeg.

    If ffmpeg is not available on the PATH, returns the original file path because
    Groq Whisper and OpenAI Whisper APIs natively support .ogg, .mp3, .mp4, and .wav.
    """
    if input_path.suffix.lower() == ".wav":
        return input_path

    wav_path = input_path.with_suffix(".wav")
    ffmpeg_bin = shutil.which("ffmpeg")

    if not ffmpeg_bin:
        logger.info("ffmpeg not found on PATH; passing original file (%s) directly to Whisper API", input_path.suffix)
        return input_path

    try:
        cmd = [
            ffmpeg_bin,
            "-i", str(input_path),
            "-ar", "16000",
            "-ac", "1",
            str(wav_path),
            "-y",
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        if result.returncode == 0 and wav_path.exists() and wav_path.stat().st_size > 0:
            logger.info("Converted %s -> %s successfully via ffmpeg", input_path.name, wav_path.name)
            return wav_path
        logger.warning("ffmpeg conversion failed (code %d): %s; using input file", result.returncode, result.stderr.decode("utf-8", "ignore"))
    except Exception as exc:
        logger.warning("ffmpeg conversion exception (%s); using input file", exc)

    return input_path


def transcribe_audio_file(
    audio_path: Union[str, Path],
    language: str = "ta",
) -> Optional[str]:
    """Transcribe an audio file using Groq Whisper (free), OpenAI, or local Whisper.

    Order of evaluation:
    1. Groq Whisper API (model: whisper-large-v3 or whisper-large-v3-turbo)
    2. OpenAI Whisper API (model: whisper-1)
    3. Local Whisper model (if installed)
    """
    p = Path(audio_path)
    if not p.exists() or p.stat().st_size == 0:
        logger.warning("Audio file does not exist or is empty: %s", audio_path)
        return None

    # 1. Groq Whisper API (Free tier with GROQ_API_KEY)
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        for model_name in ("whisper-large-v3", "whisper-large-v3-turbo"):
            try:
                from groq import Groq

                client = Groq(api_key=groq_key)
                with open(p, "rb") as f:
                    # Provide filename tuple so Groq library passes proper Content-Type
                    audio_data = f.read()
                    transcription = client.audio.transcriptions.create(
                        file=(p.name, audio_data),
                        model=model_name,
                        language=language,
                        response_format="text",
                    )
                text = transcription if isinstance(transcription, str) else getattr(transcription, "text", str(transcription))
                if text and text.strip():
                    logger.info("Groq Whisper (%s) transcription: %s", model_name, text.strip())
                    return text.strip()
            except Exception as exc:
                logger.warning("Groq Whisper (%s) failed: %s", model_name, exc)

    # 2. OpenAI Whisper API (Fallback if OPENAI_API_KEY set)
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            import openai

            client = openai.OpenAI(api_key=openai_key)
            with open(p, "rb") as f:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language=language,
                )
            text = getattr(transcription, "text", "")
            if text and text.strip():
                logger.info("OpenAI Whisper transcription: %s", text.strip())
                return text.strip()
        except Exception as exc:
            logger.warning("OpenAI Whisper API failed: %s", exc)

    # 3. Local Whisper model (if installed)
    try:
        import whisper

        model = whisper.load_model("tiny")
        result = model.transcribe(str(p), language=language)
        text = result.get("text", "")
        if text and text.strip():
            logger.info("Local Whisper transcription: %s", text.strip())
            return text.strip()
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("Local Whisper transcription failed: %s", exc)

    return None


def transcribe_voice(
    media_url: str,
    twilio_sid: Optional[str] = None,
    twilio_token: Optional[str] = None,
    language: str = "ta",
) -> Optional[str]:
    """Download, convert, and transcribe a WhatsApp voice note.

    Returns the transcribed text string in Tamil/English, or None if transcription failed.
    Cleans up all temporary disk artifacts before returning.
    """
    downloaded_file: Optional[Path] = None
    converted_file: Optional[Path] = None

    try:
        downloaded_file = download_twilio_media(media_url, twilio_sid=twilio_sid, twilio_token=twilio_token)
        converted_file = convert_to_wav(downloaded_file)
        text = transcribe_audio_file(converted_file, language=language)
        return text
    except Exception as exc:
        logger.exception("Failed to transcribe voice note from %s: %s", media_url, exc)
        return None
    finally:
        # Clean up temporary audio files
        for f in (downloaded_file, converted_file):
            if f and f.exists():
                try:
                    f.unlink()
                except OSError:
                    pass
