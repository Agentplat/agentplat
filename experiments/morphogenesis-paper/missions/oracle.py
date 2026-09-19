#!/usr/bin/env python3
"""Independent task/dependency oracle. Does not import the JS controller/worker."""
import hashlib
import json
import sys
import statistics
from fractions import Fraction
from pathlib import Path

def digest(value):
    raw=json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
    return 'sha256:'+hashlib.sha256(raw).hexdigest()

def expected(task):
    data=[Fraction(v) for v in task['data']]
    if task['kind']=='sum':value=sum(data)
    else:
        mean=sum(data)/len(data)
        value=sum((x-mean)**2 for x in data)/len(data)
    return {'numerator':value.numerator,'denominator':value.denominator}

def score(case):
    problem=case['input'];artifacts=case['artifacts']
    assert len({(a['id'],a['version']) for a in artifacts})==len(artifacts)
    by_key={(a['id'],a['version']):a for a in artifacts}
    final_tasks={t['id']:t for t in problem['tasks']}
    final_tasks[problem['revision']['id']]=problem['revision']
    useful=0;bad=[];required=[]
    for task in final_tasks.values():
        artifact=by_key.get((task['id'],task['version']))
        valid=bool(artifact and artifact['inputDigest']==digest(task['data']) and artifact['value']==expected(task))
        if valid:useful+=1;required.append({'id':artifact['id'],'version':artifact['version'],'digest':artifact['digest']})
        elif artifact:bad.append(task['id'])
    for artifact in artifacts:
        body={k:v for k,v in artifact.items() if k!='digest'}
        assert artifact['digest']==digest(body),'artifact digest mismatch'
    report=by_key.get(('report',1))
    expected_deps=sorted(required,key=lambda d:d['id'])
    valid_report=bool(report and useful==len(final_tasks) and report['dependencies']==expected_deps)
    if report:
        values={t['id']:expected(t) for t in final_tasks.values()}
        valid_report=valid_report and report['value']==values
    events=case['events'];rent=[e for e in events if e['kind']=='role-phase']
    assert [e['sequence'] for e in events]==list(range(1,len(events)+1))
    active=set();charged=set();used=0;budget_stop=None
    for event in events:
        if event['kind']=='role-materialized':
            assert event['roleId'] not in active;active.add(event['roleId'])
        elif event['kind']=='role-retired':
            assert event['roleId'] in active;active.remove(event['roleId'])
        elif event['kind']=='role-phase':
            assert event['units']==1+len(active)
            assert event['phase'] not in charged and event['phase']<problem['horizon']
            charged.add(event['phase']);used+=event['units']
        elif event['kind']=='budget-exhausted':
            assert used+1+len(active)>problem['rolePhaseBudget'];budget_stop=event['phase']
        elif event['kind']=='artifact-accepted' and budget_stop is not None:
            raise AssertionError('artifact accepted after role budget exhaustion')
    assert active=={r['roleId'] for r in case['roles'] if r['active']}
    accepted_events=[e for e in events if e['kind']=='artifact-accepted']
    for event in accepted_events:
        artifact=next(a for a in artifacts if a['digest']==event['artifactDigest'])
        if artifact['id']=='report':assert event['phase']==problem['horizon']-1
        else:
            task=problem['revision'] if artifact['version']==2 else next(t for t in problem['tasks'] if t['id']==artifact['id'])
            assert event['phase']>=task['phase']
    if 'queryEvents' in case['metrics']:
        queries=case['metrics']['queryEvents']
        assert len(queries)==case['metrics']['queries']
        assert [q['sequence'] for q in queries]==list(range(1,len(queries)+1))
        assert len(queries)<=problem['databaseQueryBudget']
    database_exhausted=any(e['kind']=='database-budget-exhausted' for e in events)
    total_rent=sum(e['units'] for e in rent)
    assert total_rent<=problem['rolePhaseBudget']
    activations=[e for e in events if e['kind']=='role-materialized']
    duplicate_reservations=max(0,len([e for e in activations if not e.get('initial',False)])-int(problem['specialistStart'] is not None)) if case['condition']!='fixed' else 0
    accepted=[e['artifactDigest'] for e in events if e['kind']=='artifact-accepted']
    retained=sum(d in {a['digest'] for a in artifacts} for d in accepted)
    return {'usefulTasks':useful,'requiredTasks':len(final_tasks),'missionSuccess':valid_report and not database_exhausted,
      'incorrectArtifacts':bad,'rolePhaseUnits':total_rent,'roleMaterializations':len(activations),
      'duplicateRoleReservations':duplicate_reservations,'acceptedArtifacts':len(accepted),'retainedAcceptedArtifacts':retained,
      'requiredDependenciesValid':len(expected_deps),'finalReportDependenciesValid':valid_report,
      'budgetExhausted':any(e['kind']=='budget-exhausted' for e in events),
      'databaseBudgetExhausted':database_exhausted,
      'activeReservationsAtEnd':sum(r['active'] for r in case['roles']),
      'faultExposed':any(e['kind']=='ack-lost' for e in events),
      'blockedPhases':len({e['phase'] for e in events if e['kind']=='transition-blocked'}),
      'databaseQueries':case['metrics']['queries'],'wallTimeMs':case['metrics']['wallTimeMs']}

def summarize(rows,keys):
    groups={}
    for row in rows:groups.setdefault(tuple(row[k] for k in keys),[]).append(row)
    result=[]
    for key,group in sorted(groups.items()):
        result.append({**dict(zip(keys,key)),'n':len(group),
          'missionSuccesses':sum(r['missionSuccess'] for r in group),'usefulTasks':sum(r['usefulTasks'] for r in group),
          'duplicateReservations':sum(r['duplicateRoleReservations'] for r in group),
          'budgetExhaustions':sum(r['budgetExhausted'] or r['databaseBudgetExhausted'] for r in group),
          'faultExposedMissions':sum(r['faultExposed'] for r in group),'blockedPhases':sum(r['blockedPhases'] for r in group),
          'meanRolePhaseUnits':statistics.mean(r['rolePhaseUnits'] for r in group),
          'medianDatabaseQueries':statistics.median(r['databaseQueries'] for r in group),
          'medianWallTimeMs':statistics.median(r['wallTimeMs'] for r in group),
          'minWallTimeMs':min(r['wallTimeMs'] for r in group),'maxWallTimeMs':max(r['wallTimeMs'] for r in group),
          'retainedAcceptedArtifacts':sum(r['retainedAcceptedArtifacts'] for r in group),
          'acceptedArtifacts':sum(r['acceptedArtifacts'] for r in group),
          'validFinalReports':sum(r['finalReportDependenciesValid'] for r in group)})
    return result

def main(folder,destination):
    folder=Path(folder);cases=[json.loads(p.read_text()) for p in sorted((folder/'cases').glob('*.json'))]
    destination=Path(destination);destination.mkdir(parents=True,exist_ok=False)
    rows=[{'caseId':c['caseId'],'condition':c['condition'],'seed':c['input']['seed'],'shape':c['input']['shape'],'fault':c['input']['fault'],**score(c)} for c in cases]
    (destination/'scores.json').write_text(json.dumps(rows,indent=2)+'\n')
    groups=summarize(rows,['condition'])
    (destination/'summary.json').write_text(json.dumps({'conditions':groups,'cells':summarize(rows,['shape','fault','condition'])},indent=2)+'\n')
    paired=[]
    for base in ['fixed','minimal','durable']:
        differences=[]
        for row in [r for r in rows if r['condition']=='morphogenesis']:
            other=next(r for r in rows if r['condition']==base and all(r[k]==row[k] for k in ['seed','shape','fault']))
            differences.append({k:float(row[k])-float(other[k]) for k in ['missionSuccess','usefulTasks','rolePhaseUnits','databaseQueries','wallTimeMs']})
        paired.append({'comparison':f'morphogenesis minus {base}','pairs':len(differences),'meanDifferences':{k:statistics.mean(d[k] for d in differences) for k in differences[0]}})
    (destination/'paired.json').write_text(json.dumps(paired,indent=2)+'\n')
    provenance={'oracleSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
      'rawManifestSha256':hashlib.sha256((folder/'manifest.json').read_bytes()).hexdigest(),
      'interpretation':'Descriptive paired finite-grid results; no population failure-rate estimate or monetary conversion.'}
    (destination/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    manifest=[{'path':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(destination.iterdir()) if p.is_file()]
    (destination/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'scoredCases':len(rows),'missionSuccesses':sum(r['missionSuccess'] for r in rows)}))

if __name__=='__main__':main(sys.argv[1],sys.argv[2])
