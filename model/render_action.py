import bpy
import os
from mathutils import Vector

ROOT = r"C:\Users\陈懒人\Desktop\Token-Cat-v0.5.0\LuluPet\model"
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "lulu_static.blend"))
scene = bpy.context.scene
arm = bpy.data.objects["LuluRig"]

# preview a specific action without NLA strips
for track in arm.animation_data.nla_tracks:
    track.mute = True
arm.animation_data.action = bpy.data.actions.get("Idle_Groom") or bpy.data.actions.get("Idle_Yawn")
scene.frame_set(30)

cam = bpy.data.objects["Cam"]
cam.location = (0.0, -6.0, 1.55)
direction = Vector((0, 0, 1.30)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

scene.render.resolution_x = 620
scene.render.resolution_y = 760
scene.render.filepath = os.path.join(ROOT, "groom-lift.png")
bpy.ops.render.render(write_still=True)
print("RENDERED", scene.render.filepath)
