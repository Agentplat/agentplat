#!/usr/bin/env python3
"""Plot retained descriptive results; requires matplotlib, no network access."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root=Path(__file__).resolve().parents[2]
folder=root/'docs/research/morphogenesis-paper-v0.4'
summary=json.loads((folder/'analysis/summary.json').read_text())
rows={r['condition']:r for r in summary['conditions']}
order=['fixed','minimal','durable','morphogenesis']
labels=['Fixed','Minimal','Durable\nworkflow','Morpho-\ngenesis']
colors=['#687b8c','#bf7941','#579184','#245c7b']
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':8,'axes.titlesize':9,'axes.labelsize':8,
                     'svg.fonttype':'none','pdf.fonttype':42})
fig,axes=plt.subplots(1,3,figsize=(8.0,3.0),layout='constrained')
panels=[('missionSuccesses','Correct final reports','Reports (384 per condition)',400),
        ('meanRolePhaseUnits','Reserved roles over time','Mean role-phase units',14),
        ('medianDatabaseQueries','Persistence overhead','Median client SQL calls',115)]
for ax,(field,title,ylabel,top) in zip(axes,panels):
    values=[rows[k][field] for k in order]
    bars=ax.bar(range(4),values,color=colors,width=.68)
    ax.set_xticks(range(4),labels);ax.set_title(title,loc='left',fontweight='bold',pad=10)
    ax.set_ylabel(ylabel);ax.set_ylim(0,top);ax.set_axisbelow(True);ax.grid(axis='y',color='#e3e8eb',lw=.6)
    ax.spines[['top','right']].set_visible(False)
    ax.spines[['bottom','left']].set_color('#b4c0c8')
    ax.tick_params(axis='both',length=0)
    for bar,v in zip(bars,values):ax.text(bar.get_x()+bar.get_width()/2,v+top*.02,f'{v:g}',ha='center',va='bottom',fontsize=8)
fig.suptitle('Four-condition finite-grid evaluation | 1,536 local deterministic runs',fontsize=10,fontweight='bold',x=.01,ha='left')
destination=folder/'figures';destination.mkdir(exist_ok=True)
for extension in ['png','svg','pdf']:fig.savefig(destination/f'mission-comparison.{extension}',dpi=300,bbox_inches='tight')
(destination/'mission-comparison-metadata.json').write_text(json.dumps({'matplotlib':matplotlib.__version__,'data':'analysis/summary.json',
  'interpretation':'Descriptive aggregate of the declared grid; fixed condition has no runtime activation-fault exposure; role units are not money; failed ablation runs remain included.'},indent=2)+'\n')
print(destination/'mission-comparison.png')
