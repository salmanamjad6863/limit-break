"""
Batch-render exercise loops from the trainer stage file (VISUALS.md §3.1, §3.5).

Run with Blender (free) in the background:

  blender -b assets-src/trainer/stage.blend --python tools/render/render_exercise.py -- \
      --ids push-up,bodyweight-squat --trainer a

The stage .blend must contain (one-time setup, see tools/render/README.md):
  * armatures  "Trainer_A" / "Trainer_B"  (VRoid model rigged on the Mixamo skeleton)
  * cameras    "CAM_front" / "CAM_side"   (locked: same height, lens and distance for every clip)
  * lights, floor shadow catcher and the toon/outline materials

For each exercise it imports the motion FBX, moves its action onto the trainer, sets the loop
range and renders transparent PNG frames to  tools/render/out/<id>/<trainer>/<angle>/####.png .
Then run  node tools/render/encode.mjs  to make the WebP files.
"""
import argparse
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MOTIONS = os.path.join(ROOT, "assets-src", "motions")
OUT = os.path.join(HERE, "out")


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--ids", default="", help="comma-separated exercise ids (default: every job)")
    p.add_argument("--trainer", default="", help="a or b (default: job/defaults)")
    p.add_argument("--preview", action="store_true", help="half resolution, every 2nd frame (fast look)")
    return p.parse_args(argv)


def eevee_engine():
    items = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    for name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if name in items:
            return name
    raise RuntimeError(f"No EEVEE engine in {list(items)}")


def import_action(path):
    """Import an FBX, return its action, and delete the imported objects (we only keep the motion)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)
    new = [o for o in bpy.data.objects if o not in before]
    action = None
    for o in new:
        if o.type == "ARMATURE" and o.animation_data and o.animation_data.action:
            action = o.animation_data.action
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    if action is None:
        raise RuntimeError(f"{path}: no armature animation found")
    action.use_fake_user = True
    return action


def assign(armature, action):
    armature.animation_data_create()
    armature.animation_data.action = action
    # Blender 4.4+ slotted actions: bind the first slot if none was picked automatically
    ad = armature.animation_data
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(getattr(action, "slots", [])):
        ad.action_slot = action.slots[0]


def main():
    a = args()
    with open(os.path.join(HERE, "jobs.json")) as f:
        jobs = json.load(f)
    defaults = jobs["defaults"]
    ids = [i for i in a.ids.split(",") if i] or list(jobs["exercises"].keys())

    scene = bpy.context.scene
    scene.render.engine = eevee_engine()
    scene.render.film_transparent = True  # the aura is drawn live in the app, behind the trainer
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.fps = defaults["fps"]

    for ex_id in ids:
        job = {**defaults, **jobs["exercises"][ex_id]}
        action = import_action(os.path.join(MOTIONS, job["motion"]))
        start, end = job["frames"]
        size = job["size"] // (2 if a.preview else 1)
        scene.render.resolution_x = scene.render.resolution_y = size
        scene.frame_start, scene.frame_end = start, end
        scene.frame_step = 2 if a.preview else 1
        trainers = [a.trainer] if a.trainer else job["trainers"]
        for t in trainers:
            arm = bpy.data.objects.get(f"Trainer_{t.upper()}")
            if arm is None:
                raise RuntimeError(f"stage file has no armature Trainer_{t.upper()}")
            for o in bpy.data.objects:  # only the chosen trainer is visible
                if o.name.startswith("Trainer_") and o.type == "ARMATURE":
                    hide = o is not arm
                    o.hide_render = hide
                    for child in o.children_recursive:
                        child.hide_render = hide
            assign(arm, action)
            for angle in job["angles"]:
                cam = bpy.data.objects.get(f"CAM_{angle}")
                if cam is None:
                    raise RuntimeError(f"stage file has no camera CAM_{angle}")
                scene.camera = cam
                scene.render.filepath = os.path.join(OUT, ex_id, t, angle, "")
                print(f"[render] {ex_id} trainer {t} {angle}: frames {start}-{end} @ {size}px")
                bpy.ops.render.render(animation=True)
        with open(os.path.join(OUT, ex_id, "job.json"), "w") as f:
            json.dump({**job, "id": ex_id, "preview": a.preview}, f, indent=2)
    print("[render] done. Next: node tools/render/encode.mjs --ids " + ",".join(ids))


if __name__ == "__main__":
    main()
