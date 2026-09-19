#!/usr/bin/env python3
"""Render the v0.2 Markdown manuscript and three native vector figures.

Requires reportlab and Times New Roman/Arial TTFs; no network access.
The small parser supports only the constructs used by this manuscript.
"""
import html
import os
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, Image, CondPageBreak
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT = Path(__file__).resolve().parents[2]
VERSION = sys.argv[1] if len(sys.argv)>1 else 'v0.2'
assert VERSION in ('v0.2','v0.3','v0.4')
SOURCE = ROOT / f'docs/research/morphogenesis-paper-{VERSION}'
OUTPUT = ROOT / f'output/pdf/agent-morphogenesis-paper-{VERSION}.pdf'
FONT_DIR = Path(os.environ.get('MORPHOGENESIS_FONT_DIR', '/System/Library/Fonts/Supplemental'))
for name, filename in [('Serif','Times New Roman.ttf'), ('Serif-Bold','Times New Roman Bold.ttf'),
                       ('Serif-Italic','Times New Roman Italic.ttf'), ('Serif-BoldItalic','Times New Roman Bold Italic.ttf'),
                       ('Sans','Arial.ttf'), ('Sans-Bold','Arial Bold.ttf'), ('MathSymbols','Arial Unicode.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
pdfmetrics.registerFontFamily('Serif', normal='Serif', bold='Serif-Bold', italic='Serif-Italic', boldItalic='Serif-BoldItalic')
pdfmetrics.registerFontFamily('Sans', normal='Sans', bold='Sans-Bold', italic='Sans', boldItalic='Sans-Bold')
INK = colors.HexColor('#182637')
BLUE = colors.HexColor('#235e7d')
PALE = colors.HexColor('#edf3f6')
GREY = colors.HexColor('#52616e')
W = A4[0] - 104

styles = {
    'title': ParagraphStyle('title',fontName='Serif-Bold',fontSize=20,leading=23,spaceAfter=12,textColor=INK),
    'body': ParagraphStyle('body',fontName='Serif',fontSize=10.5,leading=13.6,spaceAfter=6,alignment=TA_JUSTIFY),
    'h2': ParagraphStyle('h2',fontName='Sans-Bold',fontSize=13,leading=16,spaceBefore=13,spaceAfter=7,keepWithNext=True,textColor=INK),
    'h3': ParagraphStyle('h3',fontName='Sans-Bold',fontSize=10.5,leading=14,spaceBefore=9,spaceAfter=5,keepWithNext=True,textColor=INK),
    'small': ParagraphStyle('small',fontName='Serif',fontSize=9.2,leading=12,spaceAfter=5),
    'caption': ParagraphStyle('caption',fontName='Serif-Italic',fontSize=9,leading=11.8,spaceAfter=9,textColor=GREY),
    'cell': ParagraphStyle('cell',fontName='Serif',fontSize=9.1,leading=11.7),
    'headcell': ParagraphStyle('headcell',fontName='Sans-Bold',fontSize=8.5,leading=11,textColor=INK),
    'math': ParagraphStyle('math',fontName='Serif',fontSize=10.2,leading=15,spaceBefore=3,spaceAfter=9,leftIndent=12),
    'code': ParagraphStyle('code',fontName='Courier',fontSize=8.1,leading=11,spaceAfter=2,leftIndent=10),
}

def math_text(value):
    value = value.replace(r'\land','∧').replace(r'\rightarrow','→')
    value = html.escape(value)
    value = value.replace('∧', '<font name="MathSymbols">∧</font>')
    return re.sub(r'([A-Za-z])_([A-Za-z0-9])', r'\1<sub size="7" rise="2">\2</sub>', value)

def inline(value):
    tokens = []
    def token(markup):
        tokens.append(markup)
        return f'ZZTOKEN{len(tokens)-1}ZZ'
    value = re.sub(r'\\\((.*?)\\\)', lambda m: token(math_text(m[1])), value)
    def link(m):
        label, target = html.escape(m[1]), m[2]
        if target.startswith('https://'):
            return token(f'<a href="{html.escape(target, quote=True)}" color="#235e7d">{label}</a>')
        # New companion files are not yet deposited. Do not invent public URLs.
        return token(label)
    value = re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,value)
    value = html.escape(value)
    value = re.sub(r'`([^`]+)`',r'<font name="Courier" size="8.5">\1</font>',value)
    value = re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',value)
    value = re.sub(r'\*([^*]+)\*',r'<i>\1</i>',value)
    for i, t in enumerate(tokens): value = value.replace(f'ZZTOKEN{i}ZZ',t)
    return value

def box(d,x,y,w,h,lines,fill=PALE,bold=False,size=9.2):
    d.add(Rect(x,y,w,h,rx=5,ry=5,fillColor=fill,strokeColor=colors.HexColor('#b5c5cf'),strokeWidth=.6))
    text = lines.split('\n')
    for i,line in enumerate(text):
        d.add(String(x+w/2,y+h/2+(len(text)-1)*6-i*12,line,
                     fontName='Sans-Bold' if bold and i==0 else 'Sans',fontSize=size,textAnchor='middle',fillColor=INK))

def arrow(d,x1,y1,x2,y2,color=BLUE):
    d.add(Line(x1,y1,x2,y2,strokeColor=color,strokeWidth=1))
    if x1==x2:
        sign=1 if y2>y1 else -1
        points=[x2,y2,x2-3,y2-sign*5,x2+3,y2-sign*5]
    else:
        sign=1 if x2>x1 else -1
        points=[x2,y2,x2-sign*5,y2-3,x2-sign*5,y2+3]
    d.add(Polygon(points,fillColor=color,strokeColor=color))

def figures():
    drawings={}
    d=Drawing(W,170)
    box(d,0,130,W,36,'Agent Room (optional integration context)\nGoals, participants, reviewed work, versioned artifacts and human decisions',bold=True)
    arrow(d,W/2,130,W/2,115)
    box(d,0,75,W,40,'Morphogenesis transition\nObservation → exact proposal → decision → intent → owner receipts → accepted head',bold=True,size=9)
    arrow(d,W/2,75,W/2,61)
    gap=8; bw=(W-gap*4)/5
    for i,label in enumerate(['Lifecycle','Membership','Team','Work','Action']):
        box(d,i*(bw+gap),18,bw,43,label+'\nOwn admission\nand effects',fill=colors.white,size=8.5)
    d.add(String(W/2,3,'A decision or projection does not replace owner authorization.',fontName='Sans',fontSize=8.5,textAnchor='middle',fillColor=GREY))
    drawings['architecture']=d
    d=Drawing(W,241); pw=(W-20)/2
    d.add(String(0,228,'A. Lost acknowledgement',fontName='Sans-Bold',fontSize=10,fillColor=INK))
    d.add(String(pw+20,228,'B. Competing successors',fontName='Sans-Bold',fontSize=10,fillColor=INK))
    for x,texts in [(0,['Persist intent: operation K','Owner applies K; receipt flushed','Worker killed before response','New worker reconciles K','Recover receipt; advance head']),
                    (pw+20,['Both proposals bind epoch e','Owner effects A and B applied','A commits head e + 1','B loses predecessor CAS','Effect B remains to be resolved'])]:
        for i,t in enumerate(texts):
            y=183-i*42
            box(d,x,y,pw,30,t,fill=PALE if i!=4 else colors.HexColor('#e8f0eb'),size=8.6)
            if i<4: arrow(d,x+pw/2,y,x+pw/2,y-12)
    drawings['recovery']=d
    d=Drawing(W,190); bw=(W-40)/3
    box(d,0,142,W,40,'Persistent Agent Room: same mission context and artifact identities',bold=True)
    for i,t in enumerate(['Initial organization\nResearcher + writer','Temporary specialization\nResearcher + writer + specialist','Successor organization\nSpecialist detached']):
        x=i*(bw+20);box(d,x,64,bw,58,t,size=8.6)
        if i<2: arrow(d,x+bw,93,x+bw+20,93)
        arrow(d,x+bw/2,142,x+bw/2,122)
    box(d,0,7,W,39,'Artifacts retain versions and provenance; transition receipts explain the change.\nTask-level dependency validity still needs its own check.',fill=colors.white,size=9)
    drawings['continuity']=d
    (SOURCE/'figures').mkdir(exist_ok=True)
    for name,drawing in drawings.items(): (SOURCE/'figures'/f'{name}.svg').write_text(drawing.asString('svg'))
    return drawings

def footer(canvas,doc):
    canvas.saveState()
    canvas.setFont('Serif',9)
    canvas.setFillColor(GREY)
    canvas.drawCentredString(A4[0]/2,25,str(doc.page))
    canvas.restoreState()

def build():
    drawings=figures(); lines=(SOURCE/'manuscript.md').read_text().splitlines()
    story=[]; i=0; references=False
    while i<len(lines):
        line=lines[i].strip()
        if not line: i+=1;continue
        if line.startswith('# '):
            story.append(Paragraph(inline(line[2:]),styles['title']));i+=1;continue
        if line.startswith('## '):
            references=line=='## References'
            story.append(Paragraph(inline(line[3:]),styles['h2']));i+=1;continue
        if line.startswith('### '):
            story.append(Paragraph(inline(line[4:]),styles['h3']));i+=1;continue
        if line.startswith('!['):
            target=Path(re.search(r'\]\((.*?)\)',line)[1]);name=target.stem
            if name in drawings:graphic=drawings[name]
            else:
                graphic=Image(str(SOURCE/target));graphic.drawHeight*=W/graphic.drawWidth;graphic.drawWidth=W
            elements=[graphic,Spacer(1,4)]; i+=1
            while i<len(lines) and not lines[i].strip(): i+=1
            if i<len(lines) and lines[i].startswith('*Figure'):
                elements.append(Paragraph(inline(lines[i].strip('*')),styles['caption']));i+=1
            story.append(KeepTogether(elements));continue
        if line=='\\[':
            math=[];i+=1
            while lines[i].strip()!='\\]': math.append(math_text(lines[i]));i+=1
            story.append(Paragraph('<br/>'.join(math),styles['math']));i+=1;continue
        if line.startswith('```'):
            code=[];i+=1
            while not lines[i].startswith('```'):
                n=len(lines[i])-len(lines[i].lstrip())
                code.append(Paragraph('&nbsp;'*n+html.escape(lines[i].strip()),styles['code']));i+=1
            story.append(KeepTogether([Spacer(1,5)]+code+[Spacer(1,8)]));i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+',c) for c in cells): rows.append(cells)
                i+=1
            widths=[W/len(rows[0])]*len(rows[0])
            data=[[Paragraph(inline(c),styles['headcell' if ri==0 else 'cell']) for c in row] for ri,row in enumerate(rows)]
            t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
            t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('VALIGN',(0,0),(-1,-1),'TOP'),
                ('LINEBELOW',(0,0),(-1,0),.7,BLUE),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#d6dee3')),
                ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
                ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
            heading=story.pop() if story and isinstance(story[-1],Paragraph) and story[-1].style.name in ('h2','h3') else None
            height=t.wrap(W,10000)[1]+10
            if heading:height+=heading.wrap(W,10000)[1]+heading.style.spaceBefore+heading.style.spaceAfter
            story.append(CondPageBreak(height))
            if heading:story.append(heading)
            story.extend([t,Spacer(1,10)]);continue
        parts=[line];i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||!\[|```|\\\[|\d+\.)',lines[i].strip()):
            # Metadata has explicit Markdown hard line breaks.
            if lines[i-1].endswith('  '): break
            parts.append(lines[i].strip());i+=1
        value=' '.join(parts)
        style=styles['small'] if references or value.startswith(('**Research','**Douglas','**Reference','**Status','**Keywords')) else styles['body']
        story.append(Paragraph(inline(value),style))
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    doc=SimpleDocTemplate(str(OUTPUT),pagesize=A4,rightMargin=52,leftMargin=52,topMargin=50,bottomMargin=44,
        title='Governed Agent Morphogenesis: Runtime Organizational Reconfiguration with Bounded Authority and Causal Continuity',
        author='Douglas Rodríguez',subject=f'Research preprint {VERSION}; bounded local pilots')
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    print(OUTPUT)

if __name__=='__main__':build()
