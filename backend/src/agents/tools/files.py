import base64
import mimetypes
import os
import re
import subprocess
import tempfile

from src.observability.logging import get_logger

log = get_logger("tools.files")


def process_image(file_path: str) -> dict:
    """Base64-encode an image for use in multimodal messages."""
    ext = os.path.splitext(file_path)[1].lower()
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    media_type = media_type_map.get(ext, mimetypes.guess_type(file_path)[0] or "image/png")

    with open(file_path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")

    log.info("process_image", file=file_path, media_type=media_type, size_b64=len(data))
    return {"type": "image", "media_type": media_type, "data": data}


def process_log(file_path: str) -> str:
    """Read a log file, prioritising error/exception lines, capped at 200 lines."""
    with open(file_path, "r", errors="replace") as f:
        all_lines = f.readlines()

    error_pattern = re.compile(r"(error|exception|traceback|panic|fatal)", re.IGNORECASE)

    error_lines = []
    context_lines = []

    for i, line in enumerate(all_lines):
        if error_pattern.search(line):
            error_lines.append(f"L{i + 1}: {line.rstrip()}")
        else:
            context_lines.append(f"L{i + 1}: {line.rstrip()}")

    # Take up to 100 error lines, fill remaining with context up to 200 total
    result = error_lines[:100]
    remaining = 200 - len(result)
    if remaining > 0:
        result.extend(context_lines[:remaining])

    log.info("process_log", file=file_path, total_lines=len(all_lines), selected=len(result))
    return "\n".join(result)


def extract_video_frames(file_path: str, fps: int = 1) -> list[dict]:
    """Extract frames from a video file using ffmpeg. Returns up to 10 image dicts."""
    frames = []

    with tempfile.TemporaryDirectory() as tmpdir:
        output_pattern = os.path.join(tmpdir, "frame_%03d.png")
        cmd = [
            "ffmpeg",
            "-i", file_path,
            "-vf", f"fps={fps}",
            "-frames:v", "10",
            "-q:v", "2",
            output_pattern,
            "-y",
            "-loglevel", "error",
        ]

        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=30)
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
            log.error("ffmpeg_failed", file=file_path, error=str(exc))
            return []

        frame_files = sorted(
            f for f in os.listdir(tmpdir) if f.startswith("frame_") and f.endswith(".png")
        )

        for frame_file in frame_files[:10]:
            frame_path = os.path.join(tmpdir, frame_file)
            frames.append(process_image(frame_path))

    log.info("extract_video_frames", file=file_path, frame_count=len(frames))
    return frames
