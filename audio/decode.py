"""Decode bounded, in-memory audio without faster-whisper's obsolete PyAV arguments."""
import io
import av
import numpy as np


def decode_audio(data):
    chunks = []
    samples = 0
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)

    def append(frames):
        nonlocal samples
        for frame in frames:
            values = frame.to_ndarray().reshape(-1)
            samples += values.size
            if samples > 16000 * 120:
                raise ValueError('Audio exceeds the two-minute segment limit')
            chunks.append(values.copy())

    with av.open(io.BytesIO(data), mode='r') as container:
        for frame in container.decode(audio=0):
            frame.pts = None
            append(resampler.resample(frame))
        append(resampler.resample(None))
    if not chunks:
        return np.empty(0, dtype=np.float32)
    return np.concatenate(chunks).astype(np.float32) / 32768.0
