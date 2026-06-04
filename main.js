import OBR, { buildPath, Command } from "https://esm.sh/@owlbear-rodeo/sdk@3";

// A unique channel name so we don't collide with other extensions.
const HELLO_CHANNEL = "rodeo.hello-world/notification";

// A few graffiti-ish fill colours, picked at random per drawing.
const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f1c40f", "#e67e22"];

OBR.onReady(() => {
  // Show a notification whenever anyone broadcasts on our channel.
  // Because the sender broadcasts with destination "ALL", this same
  // handler fires for the sender too, keeping behaviour consistent.
  OBR.broadcast.onMessage(HELLO_CHANNEL, (event) => {
    OBR.notification.show(`👋 Hello World from ${event.data.from}!`, "SUCCESS");
  });

  document.getElementById("say-hello").addEventListener("click", async () => {
    // Grab the sender's display name so the message is personalised.
    const name = await OBR.player.getName();

    // Send to every connected client in the room, including ourselves.
    await OBR.broadcast.sendMessage(
      HELLO_CHANNEL,
      { from: name },
      { destination: "ALL" }
    );
  });

  document.getElementById("draw-graffiti").addEventListener("click", drawGraffiti);
});

// Returns the 4-cubic command list that traces a circle of radius r at (cx, cy).
function circleCommands(cx, cy, r) {
  const k = r * 0.5522847498307936; // bezier "magic" constant for a circle
  return [
    [Command.MOVE, cx + r, cy],
    [Command.CUBIC, cx + r, cy + k, cx + k, cy + r, cx, cy + r],
    [Command.CUBIC, cx - k, cy + r, cx - r, cy + k, cx - r, cy],
    [Command.CUBIC, cx - r, cy - k, cx - k, cy - r, cx, cy - r],
    [Command.CUBIC, cx + k, cy - r, cx + r, cy - k, cx + r, cy],
    [Command.CLOSE],
  ];
}

async function drawGraffiti() {
  if (!(await OBR.scene.isReady())) {
    OBR.notification.show("Open a scene first, then try again.", "WARNING");
    return;
  }

  // Work out where the centre of the player's current view is, in world space,
  // then nudge it by a random offset so each doodle lands somewhere new.
  const [vw, vh, scale, pos, dpi] = await Promise.all([
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
    OBR.viewport.getScale(),
    OBR.viewport.getPosition(),
    OBR.scene.grid.getDpi(),
  ]);

  const viewCenter = {
    x: (vw / 2 - pos.x) / scale,
    y: (vh / 2 - pos.y) / scale,
  };
  const target = {
    x: viewCenter.x + (Math.random() - 0.5) * 4 * dpi,
    y: viewCenter.y + (Math.random() - 0.5) * 4 * dpi,
  };

  // Build the doodle in local pixel space, centred on (0, 0) and pointing up,
  // sized relative to one grid cell (dpi). One closed path = one tidy item.
  const u = dpi;
  const hw = 0.13 * u; // shaft half-width
  const y0 = 0.45 * u; // shaft base
  const yTop = -0.45 * u; // where the straight shaft meets the tip
  const dome = -0.82 * u; // how far the rounded tip bulges past yTop
  const r = 0.23 * u; // base-circle radius
  const bx = 0.24 * u; // base-circle horizontal offset
  const by = 0.5 * u; // base-circle vertical position

  const commands = [
    // shaft + rounded tip
    [Command.MOVE, -hw, y0],
    [Command.LINE, -hw, yTop],
    [Command.CUBIC, -hw, dome, hw, dome, hw, yTop],
    [Command.LINE, hw, y0],
    [Command.CLOSE],
    // the two base circles
    ...circleCommands(-bx, by, r),
    ...circleCommands(bx, by, r),
  ];

  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  const item = buildPath()
    .commands(commands)
    .position(target)
    .rotation(Math.random() * 360)
    .fillColor(color)
    .fillOpacity(1)
    .fillRule("nonzero") // keep overlapping subpaths solid (no holes)
    .strokeColor("#1a1a1a")
    .strokeWidth(Math.max(2, 0.03 * u))
    .strokeOpacity(1)
    .layer("DRAWING")
    .name("Graffiti")
    .build();

  await OBR.scene.items.addItems([item]);
}
