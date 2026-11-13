# Independent oracle (optional): OpenCascade via cadquery-ocp. Reads a STEP file, checks each solid
# with BRepCheck and prints exact B-rep volume / centroid / inertia (density 1, mm) as JSON lines.
import sys, json
from OCP.STEPControl import STEPControl_Reader
from OCP.TopExp import TopExp_Explorer
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopoDS import TopoDS
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
from OCP.BRepCheck import BRepCheck_Analyzer
r = STEPControl_Reader()
assert r.ReadFile(sys.argv[1]) == 1
r.TransferRoots()
ex = TopExp_Explorer(r.OneShape(), TopAbs_SOLID)
while ex.More():
    s = TopoDS.Solid(ex.Current()); g = GProp_GProps(); BRepGProp.VolumeProperties_s(s, g)
    c = g.CentreOfMass(); M = g.MatrixOfInertia()
    print(json.dumps({"valid": BRepCheck_Analyzer(s).IsValid(), "V": g.Mass(), "c": [c.X(), c.Y(), c.Z()],
                      "I": [M.Value(i, j) for i in (1, 2, 3) for j in (1, 2, 3)]}))
    ex.Next()
