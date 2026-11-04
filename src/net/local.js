// local.js — single-player "network".
// Why it exists: every player action already travels as a command object
// through a transport. For co-op later, swap this for a PeerJS/WebSocket
// transport: clients send the same commands to the host, the host runs the
// one Sim and broadcasts snapshots (sim.cats, sim.mice, sim.traps, sim.hud()).
// Nothing in sim.js has to change for that.

export class LocalTransport {
  constructor(sim) { this.sim = sim; }
  send(cmd) { this.sim.command(cmd); }
}
