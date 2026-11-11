"""Run with: python3 -m unittest discover -s tests   (standard library only)."""
import re
import subprocess
import sys
import tempfile
import unittest
import xml.dom.minidom
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from render_svg import EFFECTS, render_svg  # noqa: E402

REF = re.compile(r'url\(#([^)]+)\)|aria-labelledby="([^"]+)"')


def refs(svg):
    return {a or b for a, b in REF.findall(svg)}


def ids(svg):
    return set(re.findall(r' id="([^"]+)"', svg))


class RenderSvgTest(unittest.TestCase):
    def test_every_variant_is_valid_xml_with_resolvable_refs(self):
        for effect in EFFECTS:
            for transparent in (False, True):
                for texture in (0, 0.035, 0.2):
                    with self.subTest(effect=effect, transparent=transparent, texture=texture):
                        svg = render_svg(effect, transparent=transparent, texture=texture)
                        xml.dom.minidom.parseString(svg)
                        self.assertTrue(refs(svg) <= ids(svg), refs(svg) - ids(svg))

    def test_output_is_deterministic(self):
        self.assertEqual(render_svg('pigment', seed=5), render_svg('pigment', seed=5))

    def test_different_outputs_do_not_share_referenced_ids(self):
        # Inlining two outputs in one HTML page must not cross-wire gradients.
        a = render_svg('atmospheric', seed=1)
        for other in (render_svg('atmospheric', seed=2),
                      render_svg('atmospheric', seed=1, palette=('#ffffff', '#000000')),
                      render_svg('pigment', seed=1)):
            self.assertFalse(refs(a) & ids(other))

    def test_shape_layer_names_stay_readable(self):
        svg = render_svg('atmospheric')
        for name in ('base', 'color-masses', 'mass-0', 'texture'):
            self.assertIn(f' id="{name}"', svg)
        self.assertIn(' id="petal-0"', render_svg('petal'))

    def test_invalid_input_is_rejected(self):
        for kwargs in ({'effect': 'nope'}, {'width': 8}, {'height': 20000}, {'width': 100.5},
                       {'palette': ('#fff',)}, {'palette': ('#ffffff', 'red')},
                       {'texture': -0.1}, {'texture': 0.3}, {'texture': float('nan')}):
            with self.subTest(**{k: str(v) for k, v in kwargs.items()}):
                with self.assertRaises(ValueError):
                    render_svg(**kwargs)

    def test_cli_refuses_to_overwrite_without_force(self):
        script = str(ROOT / 'scripts' / 'render_svg.py')
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'a.svg'
            run = lambda *extra: subprocess.run([sys.executable, script, '--output', str(out), *extra],
                                                capture_output=True, text=True)
            self.assertEqual(run().returncode, 0)
            self.assertEqual(run().returncode, 2)
            self.assertEqual(run('--force').returncode, 0)
            xml.dom.minidom.parse(str(out))


if __name__ == '__main__':
    unittest.main()
