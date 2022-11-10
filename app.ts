import * as crypto from 'crypto';
import WebSocket from 'ws';
import Client from './lib/client';
import LuminaireDevice from './drivers/luminaires/device';

const Homey = require('homey');

export default class CasambiApp extends Homey.App {
  protected clients: { [key: string]: Client } = {};

  protected sockets: { [key: string]: WebSocket } = {};

  protected connectedDevices: { [key: string]: LuminaireDevice } = {};

  protected latestDeviceStates: { [key: string]: any } = {};

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

  connectDevice(device: LuminaireDevice) {
    this.getSocketForDevice(device);

    const deviceId = device.getData().id;

    this.connectedDevices[deviceId] = device;

    // update device with latest known state info
    if (deviceId in this.latestDeviceStates) {
      device.updateState(this.latestDeviceStates[deviceId]);
    }
  }

  async updateDeviceState(device: LuminaireDevice, state: {}) {
    const client = this.getClientForUser(device.getSettings().username, device.getSettings().password);
    const socket = await this.getSocketForDevice(device);

    client.updateDeviceState(socket, device.getData().id, state);
  }

  protected async getSocketForDevice(device: LuminaireDevice): Promise<WebSocket> {
    const networkId = device.getData().network_id;

    if (!(networkId in this.sockets)) {
      const client = this.getClientForUser(device.getSettings().username, device.getSettings().password);
      const network = (await client.getNetworks())[networkId];

      if (network) {
        this.sockets[networkId] = client.connectSocket(network, this.unitChangedHandler.bind(this));
      }
    }

    return this.sockets[networkId];
  }

  protected unitChangedHandler(unitState: any) {
    this.latestDeviceStates[unitState.id] = unitState;

    if (unitState.id in this.connectedDevices) {
      console.log('App.unitChangedHandler recevied update for device', unitState);

      this.connectedDevices[unitState.id].updateState(unitState);
    } else {
      console.log('App.unitChangedHandler recevied update for (still) unknown device', unitState);
    }
  }
}

module.exports = CasambiApp;
