import * as crypto from 'crypto';
import WebSocket from 'ws';
import Client, { Network } from './lib/client';
import LuminaireDevice from './drivers/luminaires/device';

const Homey = require('homey');

export default class CasambiApp extends Homey.App {
  private clients: { [key: string]: Client } = {};

  private sockets: { [key: string]: WebSocket } = {};

  onInit() {
    this.log('Casambi is running...');
  }

  getClientForUser(username: string, password: string): Client {
    this.log(`Casambi getClientFor: ${username}`);

    const key = crypto.createHash('md5').update(username + password).digest('hex');

    if (!(key in this.clients)) {
      this.log(`building client for ${username}`);

      const client = new Client(Homey.env.API_KEY, `${username}`, password);

      this.clients[key] = client;
    }

    this.log(`returning client ${username}`);
    return this.clients[key];
  }

  protected async getSocketForDevice(device: LuminaireDevice): Promise<WebSocket> {
    const networkId = device.getData().network_id;

    if (!(networkId in this.sockets)) {
      const client = this.getClientForUser(device.getSettings().username, device.getSettings().password);
      const network = (await client.getNetworks())[networkId];

      if (network) {
        this.sockets[networkId] = client.connectSocket(network);
      }
    }

    return this.sockets[networkId];
  }

  connectDevice(device: LuminaireDevice) {
    this.getSocketForDevice(device);
  }

  async updateDeviceState(device: LuminaireDevice, state: {}) {
    const client = this.getClientForUser(device.getSettings().username, device.getSettings().password);
    const socket = await this.getSocketForDevice(device);

    client.updateDeviceState(socket, device.getData().id, state);
  }
}

module.exports = CasambiApp;
