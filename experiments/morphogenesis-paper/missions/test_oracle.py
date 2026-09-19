import copy
import json
import os
import unittest
from pathlib import Path
from oracle import score,digest

ROOT=Path(os.environ['MORPHOGENESIS_MISSION_DIR'])
CASES=[json.loads(p.read_text()) for p in (ROOT/'cases').glob('*.json')]
GOOD=next(c for c in CASES if c['condition']=='fixed' and c['input']['shape']=='burst' and c['input']['fault']=='none')

def replace_artifact(case,artifact):
    previous=artifact['digest'];artifact['digest']=digest({k:v for k,v in artifact.items() if k!='digest'})
    for event in case['events']:
        if event.get('artifactDigest')==previous:event['artifactDigest']=artifact['digest']

class OracleTests(unittest.TestCase):
    def test_valid_artifacts_and_report(self):
        self.assertTrue(score(GOOD)['missionSuccess'])
    def test_rehashed_wrong_variance_fails_semantics(self):
        case=copy.deepcopy(GOOD)
        target=next(t for t in case['input']['tasks'] if t['kind']=='variance')
        artifact=next(a for a in case['artifacts'] if a['id']==target['id'])
        artifact['value']['numerator']+=1;replace_artifact(case,artifact)
        self.assertIn(target['id'],score(case)['incorrectArtifacts'])
        self.assertFalse(score(case)['missionSuccess'])
    def test_rehashed_obsolete_dependency_fails(self):
        case=copy.deepcopy(GOOD);report=next(a for a in case['artifacts'] if a['id']=='report')
        dependency=next(d for d in report['dependencies'] if d['id']=='task:0')
        old=next(a for a in case['artifacts'] if a['id']=='task:0' and a['version']==1)
        dependency.update(version=1,digest=old['digest']);replace_artifact(case,report)
        self.assertEqual(score(case)['usefulTasks'],8)
        self.assertFalse(score(case)['missionSuccess'])
    def test_underreported_role_rent_is_rejected(self):
        case=copy.deepcopy(GOOD);next(e for e in case['events'] if e['kind']=='role-phase')['units']=0
        with self.assertRaises(AssertionError):score(case)

if __name__=='__main__':unittest.main()
