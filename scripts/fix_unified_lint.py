from pathlib import Path
p = Path('app/expedient-workspace-v6.tsx')
s = p.read_text(encoding='utf-8')
old = '''      const phaseResolved = definition.phase
        ? phaseSummaries[definition.phase].total > 0 && phaseSummaries[definition.phase].resolved === phaseSummaries[definition.phase].total
        : allResolved;'''
new = '''      const phaseResolved = isConsolidated
        ? allResolved
        : definition.phase
          ? phaseSummaries[definition.phase].total > 0 && phaseSummaries[definition.phase].resolved === phaseSummaries[definition.phase].total
          : allResolved;'''
if old not in s:
    raise SystemExit('Bloque esperado no encontrado')
p.write_text(s.replace(old, new, 1), encoding='utf-8')
