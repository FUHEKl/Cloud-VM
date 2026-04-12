# PFE Rapport (Overleaf-ready)

This folder contains a complete, long-form LaTeX report template in English for your PFE, plus UML source files and teammate handoff notes.

## Files

- `main.tex`: full report template (Agile, backlog, sprints, architecture, implementation, infra placeholders, testing TODO section)
- `uml/*.puml`: PlantUML source files for required diagrams
- `teammate_rsi_handoff.md`: exact sections your RSI/server teammate should fill
- `figures/.gitkeep`: placeholder folder for generated images

## How to use in Overleaf

1. Create a new Overleaf project.
2. Upload all files from this `rapport/` folder.
3. Keep `main.tex` as the root document.
4. Generate diagrams from `uml/*.puml` to PNG/SVG and upload them into `figures/`.
5. Replace placeholders in `main.tex` (`Your Full Name`, `Supervisor Name`, etc.).

## Expected diagram output names

- `figures/architecture-overview.png`
- `figures/uml-usecase.png`
- `figures/uml-class.png`
- `figures/uml-component.png`
- `figures/uml-seq-auth.png`
- `figures/uml-seq-vm-lifecycle.png`
- `figures/uml-seq-terminal.png`
- `figures/uml-deployment.png`

`main.tex` compiles even if images are not uploaded yet (it shows safe placeholders).
