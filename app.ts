import * as crypto from 'crypto';
import WebSocket from 'ws';
import Client, {Network} from './lib/client';
import LuminaireDevice from './drivers/luminaires/device';

const Homey = require('homey');

// Start debuger
if (process.env.DEBUG === "1") {
  require("inspector").open(9229, "0.0.0.0", false);
}

export default class CasambiApp extends Homey.App {
  protected clients: { [key: string]: Client } = {};

  onInit() {
    this.log('Casambi is running...');
  }

  getClientForUser(username: string, password: string): Client {
    this.log(`Casambi getClientFor: ${username}`);

    const key = crypto.createHash('md5').update(username + password).digest('hex');

    if (!(key in this.clients)) {
      // this.log(` - building client for ${username}`);
      this.clients[key] = new Client(Homey.env.API_KEY, `${username}`, password);
    // } else {
      // this.log(` - returning client ${username} from cache`);
    }

    return this.clients[key];
  }

  async updateDeviceState(device: LuminaireDevice, state: {}) {
    const client = this.getClientForUser(device.getSettings().username, device.getSettings().password);

    await client.updateDeviceState(device.getData().network_id, device.getData().id, state);
  }

  async connectDevice(device: LuminaireDevice) {
    const client = this.getClientForUser(device.getSettings().username, device.getSettings().password);

    client.addUnitChangedHandler(device.getData().network_id, device.getData().id, device.updateState.bind(device));
  }
}

module.exports = CasambiApp;
