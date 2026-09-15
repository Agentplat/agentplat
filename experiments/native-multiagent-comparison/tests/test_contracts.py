"""Small protocol fixtures test software, never populate study results."""
import concurrent.futures
import tempfile
import unittest
from pathlib import Path

from native_eval.study import schedule, verify_files
from native_eval.gateway import Ledger, usage_cost


class Contracts(unittest.TestCase):
    def test_schedule_is_paired_balanced_and_stable(self):
        slots = schedule()
        self.assertEqual(slots, schedule())
        self.assertEqual(len(slots), 12)
        self.assertEqual(len({s['slot_id'] for s in slots}), 12)
        self.assertEqual(sum(s['arm'] == 'agentplat' for s in slots[::2]), 3)
        for left, right in zip(slots[::2], slots[1::2]):
            self.assertEqual((left['task'], left['repetition']),
                             (right['task'], right['repetition']))
            self.assertNotEqual(left['arm'], right['arm'])

    def test_hashes_detect_changes_missing_files_and_symlinks(self):
        from hashlib import sha256
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'input').write_bytes(b'contract fixture')
            expected = {'input': {'sha256': sha256(b'contract fixture').hexdigest()}}
            verify_files(root, expected)
            (root / 'input').write_bytes(b'changed')
            with self.assertRaises(ValueError): verify_files(root, expected)
            (root / 'input').unlink()
            with self.assertRaises(ValueError): verify_files(root, expected)
            (root / 'input').symlink_to('/etc/hosts')
            with self.assertRaises(ValueError): verify_files(root, expected)

    def test_aggregate_reservations_are_atomic_and_uncertain_spend_stays_reserved(self):
        ledger = Ledger('1')
        def reserve(i):
            try:
                ledger.reserve(str(i), 300_000_000)
                return str(i)
            except ValueError:
                return None
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            admitted = [i for i in pool.map(reserve, range(10)) if i is not None]
            self.assertEqual(len(admitted), 3)
        ledger.settle(admitted[0], 100_000_000)
        self.assertEqual(ledger.available, 300_000_000)
        ledger.uncertain(admitted[1])
        self.assertFalse(ledger.complete)
        with self.assertRaises(ValueError): ledger.reserve('later', 1)

    def test_usage_separates_cache_and_rejects_unknown_values(self):
        usage = dict(input_tokens=100, output_tokens=20,
                     cache_read_input_tokens=40, cache_creation_input_tokens=10,
                     cache_creation={'ephemeral_5m_input_tokens': 10,
                                     'ephemeral_1h_input_tokens': 0})
        self.assertEqual(usage_cost(usage), 649_500)
        with self.assertRaises(ValueError): usage_cost({'input_tokens': 100})
        with self.assertRaises(ValueError): Ledger('NaN')
        with self.assertRaises(ValueError): Ledger('0')


if __name__ == '__main__':
    unittest.main()
