"""Gnorman's particulars: where things are on his sculpt, read off measured pictures of it. The game's axes (metres):
y up, he faces +z, his left is +x."""
EYE = (0.0215, 0.2405, 0.0358); EYE_R = 0.0098        # (the ball stands a little proud of his face, for the lids to close over)
NOSE = (0.0, 0.2275, 0.063)
HAT_TIP = (0.006, 0.402, -0.01)
BONES = [
    {'name': 'hips', 'at': [0, 0.075, 0]},
    {'name': 'legL', 'parent': 'hips', 'at': [0.03, 0.06, 0]}, {'name': 'legR', 'parent': 'hips', 'at': [-0.03, 0.06, 0]},
    {'name': 'torso', 'parent': 'hips', 'at': [0, 0.09, 0]},
    {'name': 'head', 'parent': 'torso', 'at': [0, 0.2, -0.005]},
    {'name': 'hat1', 'parent': 'head', 'at': [0, 0.262, -0.005]}, {'name': 'hat2', 'parent': 'hat1', 'at': [0.002, 0.325, -0.008]}, {'name': 'fan', 'parent': 'hat2', 'at': list(HAT_TIP)},
    {'name': 'armL', 'parent': 'torso', 'at': [0.076, 0.186, -0.01]}, {'name': 'foreL', 'parent': 'armL', 'at': [0.093, 0.214, -0.01]}, {'name': 'handL', 'parent': 'foreL', 'at': [0.105, 0.238, -0.01]},
    {'name': 'armR', 'parent': 'torso', 'at': [-0.076, 0.176, 0]}, {'name': 'foreR', 'parent': 'armR', 'at': [-0.096, 0.137, 0.004]}, {'name': 'handR', 'parent': 'foreR', 'at': [-0.106, 0.102, 0.008]},
    {'name': 'browL', 'parent': 'head', 'at': [0.022, 0.2575, 0.046]}, {'name': 'browR', 'parent': 'head', 'at': [-0.022, 0.2575, 0.046]},
    {'name': 'tash', 'parent': 'head', 'at': [0, 0.207, 0.05]},
]
