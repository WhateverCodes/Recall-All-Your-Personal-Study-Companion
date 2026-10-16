"""Run with data/speech-runtime/Scripts/python.exe tests/test_audio_decoder.py."""
import io
import sys
import wave
import unittest
from pathlib import Path
import av
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'audio'))
from decode import decode_audio


class AudioDecoderTests(unittest.TestCase):
    def test_stereo_wav_resamples_to_mono(self):
        data = io.BytesIO()
        with wave.open(data, 'wb') as out:
            out.setnchannels(2)
            out.setsampwidth(2)
            out.setframerate(48000)
            out.writeframes(bytes(48000 * 4))
        samples = decode_audio(data.getvalue())
        self.assertEqual(len(samples), 16000)
        self.assertEqual(samples.dtype, np.float32)
        self.assertFalse(samples.any())

    def test_browser_webm_opus(self):
        data = io.BytesIO()
        with av.open(data, mode='w', format='webm') as out:
            stream = out.add_stream('libopus', rate=48000)
            stream.layout = 'mono'
            frame = av.AudioFrame.from_ndarray(np.zeros((1,48000), dtype=np.int16), format='s16', layout='mono')
            frame.sample_rate = 48000
            for packet in stream.encode(frame):
                out.mux(packet)
            for packet in stream.encode(None):
                out.mux(packet)
        self.assertEqual(len(decode_audio(data.getvalue())), 16000)

    def test_invalid_recording_is_rejected(self):
        with self.assertRaises(Exception):
            decode_audio(b'not an audio recording')


if __name__ == '__main__':
    unittest.main()
