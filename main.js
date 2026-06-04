import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3";

// A unique channel name so we don't collide with other extensions.
const HELLO_CHANNEL = "rodeo.hello-world/notification";

OBR.onReady(() => {
  // Show a notification whenever anyone broadcasts on our channel.
  // Because the sender broadcasts with destination "ALL", this same
  // handler fires for the sender too, keeping behaviour consistent.
  OBR.broadcast.onMessage(HELLO_CHANNEL, (event) => {
    OBR.notification.show(`👋 Hello World from ${event.data.from}!`, "SUCCESS");
  });

  const button = document.getElementById("say-hello");
  button.addEventListener("click", async () => {
    // Grab the sender's display name so the message is personalised.
    const name = await OBR.player.getName();

    // Send to every connected client in the room, including ourselves.
    await OBR.broadcast.sendMessage(
      HELLO_CHANNEL,
      { from: name },
      { destination: "ALL" }
    );
  });
});
