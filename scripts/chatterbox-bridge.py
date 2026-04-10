import argparse
import math


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--format", required=True)
    parser.add_argument("--voice-prompt")
    parser.add_argument("--language-id")
    parser.add_argument("--device")
    parser.add_argument("--cfg-weight", type=float)
    parser.add_argument("--exaggeration", type=float)
    parser.add_argument("--speed", type=float)
    return parser


def resolve_device(device: str | None) -> str:
    if device:
        return device

    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def load_model(model_name: str, device: str):
    normalized = model_name.lower()
    if "turbo" in normalized:
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        return ChatterboxTurboTTS.from_pretrained(device=device)
    if "multilingual" in normalized:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        return ChatterboxMultilingualTTS.from_pretrained(device=device)

    from chatterbox.tts import ChatterboxTTS

    return ChatterboxTTS.from_pretrained(device=device)


def apply_speed(wav, speed: float | None):
    if speed is None or speed == 1.0:
        return wav

    if speed <= 0:
        raise SystemExit("--speed must be greater than 0")

    import torch
    import torchaudio.functional as F

    waveform = wav
    squeeze = waveform.dim() == 1
    if squeeze:
        waveform = waveform.unsqueeze(0)

    n_fft = 1024
    hop_length = 256
    win_length = 1024
    window = torch.hann_window(win_length, device=waveform.device)
    spec = torch.stft(
        waveform.to(dtype=torch.float32),
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=win_length,
        window=window,
        return_complex=True,
    )
    phase_advance = torch.linspace(
        0,
        math.pi * hop_length,
        spec.size(-2),
        device=spec.device,
    )[..., None]
    stretched_spec = F.phase_vocoder(spec, rate=speed, phase_advance=phase_advance)
    target_length = max(1, int(round(waveform.size(-1) / speed)))
    stretched = torch.istft(
        stretched_spec,
        n_fft=n_fft,
        hop_length=hop_length,
        win_length=win_length,
        window=window,
        length=target_length,
    )

    if squeeze:
        return stretched.squeeze(0)

    return stretched


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    try:
        import torchaudio as ta
    except Exception as exc:
        raise SystemExit(f"torchaudio import failed: {exc}") from exc

    device = resolve_device(args.device)
    model = load_model(args.model, device)
    generation_kwargs = {}

    if args.voice_prompt:
        generation_kwargs["audio_prompt_path"] = args.voice_prompt

    if args.language_id:
        generation_kwargs["language_id"] = args.language_id

    if args.cfg_weight is not None:
        generation_kwargs["cfg_weight"] = args.cfg_weight

    if args.exaggeration is not None:
        generation_kwargs["exaggeration"] = args.exaggeration

    wav = model.generate(args.text, **generation_kwargs)
    wav = apply_speed(wav, args.speed)
    output_format = args.format.lower()
    ta.save(args.output, wav, model.sr, format=output_format)


if __name__ == "__main__":
    main()
