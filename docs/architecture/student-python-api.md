# Student Python API

Students own the robot-navigation implementation: sensor interpretation, odometry/localization, filtering, target navigation, and motor control. The simulator supplies only a small read-only mission/sensor API and accepts one validated motor command each tick.

The interactive field reference is available in the application’s **Sensor API** page (`#/sensors`).

## Controller lifecycle

```python
def initialize(mission):
    # Optional. Called once at the beginning of every run.
    pass

def update(readings):
    # Required. Called once per fixed simulation tick.
    return MotorCommand(left=0.0, right=0.0)
```

Module-level Python state persists during one run and is reset by Run, Reset, Stop recovery, or a controller timeout. No navigation or sensor-fusion algorithm is supplied by the simulator.

## Values available to Python

```python
# In initialize(mission)
mission.target_latitude_deg     # float, decimal degrees
mission.target_longitude_deg    # float, decimal degrees
mission.target_radius_m         # float, meters

# In update(readings)
readings.time_s                 # float, simulation seconds

readings.gps.valid              # bool
readings.gps.latitude_deg       # float, decimal degrees
readings.gps.longitude_deg      # float, decimal degrees
readings.gps.horizontal_accuracy_m  # float, meters

readings.compass.heading_rad    # float; 0=east, positive=counterclockwise

readings.encoders.left_ticks        # int, signed cumulative ticks
readings.encoders.right_ticks       # int, signed cumulative ticks
readings.encoders.left_delta_ticks  # int, signed ticks since prior tick
readings.encoders.right_delta_ticks # int, signed ticks since prior tick
```

The API is intentionally raw and its shape does not change between sensor scenarios. The **Ideal sensors** profile is valid/noise-free. Other profiles can introduce a fixed update rate, seeded Gaussian noise, a fixed bias, and deterministic dropouts:

- A GPS dropout sets `readings.gps.valid` to `False`; its coordinate fields retain their most recently sampled values.
- A compass or encoder dropout holds its most recently sampled value. Encoder deltas are zero while held.
- A sensor only changes when its configured sample time arrives; `readings.time_s` always advances at the simulation timestep.

The selected replay seed makes the measurement sequence reproducible. Python receives no profile configuration, random seed, true pose, target-relative values, or map state.

## Motor output

```python
return MotorCommand(left, right)
```

Both values must be finite numbers from `-1.0` through `1.0`. They independently control the normalized left/right wheel velocity. Invalid values, a Python exception, or a timeout end the run with an explicit controller error.

## Optional estimator diagnostics

`update(readings)` may also report the student's own pose estimate. This does not affect physics,
motor validation, sensor values, or any simulation result. It is an append-only diagnostic record
shown only in the UI replay and benchmark reports.

```python
def update(readings):
    # Your estimator might fuse GPS, compass, and encoders here.
    report_estimate(
        latitude_deg=readings.gps.latitude_deg,
        longitude_deg=readings.gps.longitude_deg,
        heading_rad=readings.compass.heading_rad,
        label="gps/compass estimate",  # optional; up to 80 characters
    )
    return MotorCommand(left=0.25, right=0.25)
```

`latitude_deg`, `longitude_deg`, and `heading_rad` must be finite numbers. Latitude must be in
`[-90, 90]`, longitude in `[-180, 180]`, and `label` must be a string of at most 80 characters.
The helper is available only during `update`; invalid reports are explicit controller errors. The
simulator compares valid reports with UI-only truth at the sensor-reading time and displays the
estimate path plus position/heading error. True pose is never returned to Python.

## Deliberate boundary

Student code cannot access true rover pose, target distance/bearing, trajectory, map state, direct world mutation, or simulation controls. Values in the lab’s telemetry/map panels are for human inspection; they are not an API available to Python.
