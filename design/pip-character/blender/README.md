# Pip Blender Scripts

These scripts build and render the procedural v001 Pip model.

Generate the model:

```bash
blender --background --python design/pip-character/blender/create_pip_v001.py
```

Generate the reference-match rebuild and review renders:

```bash
blender --background --python design/pip-character/blender/create_pip_v001_reference_matched.py
```

Render the asset kit:

```bash
blender --background design/pip-character/generated/pip_v001_generated.blend --python design/pip-character/blender/render_pip_asset_kit.py
```

The generated model is a blockout source for review and manual polishing. It must keep Pip as one unified sage pebble body with small dot eyes, a gentle smile, tiny arms, and a visible leafy branch in every render.

The reference-match rebuild outputs `design/pip-character/generated/pip_v001_reference_matched.blend` plus review renders and a QA sheet in `design/pip-character/generated/previews/`. It is the current higher-fidelity review artifact, but production replacement still requires human approval of the QA sheet.
