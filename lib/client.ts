import fetch, {HeaderInit} from 'node-fetch';
import WebSocket from 'ws';
import LuminaireDevice from "../drivers/luminaires/device";

export const BASE_URL = 'https://door.casambi.com/v1';

export interface Network {
  id: string;
  mac: string;
  name: string;
  type: string;
  grade: string;
  sessionId: string;
}

export interface NetworkList {
  // expires_at: number;
  [id: string]: Network;
}

interface SocketStates {
  [id: string]: WebSocket;
}

export interface Device {
  // scheduleId: string;
  id: string;
  name: string;
  // isOnline: boolean;
  // model: string;
  // manufacturer: string;
  // properties: Array<any>;
  // parameters: Object
  // _etag: string;
  // bdrSetting: number;
  // priority: number;
  on: boolean;
  online: boolean;
  condition: number;
  activeSceneId: number;
  address: string;
  image: string;
  firmwareVersion: string;
  position: number;
  fixtureId: number;
  groupId: number;
  type: string;
}

interface Devices {
  [id: string]: Device;
}

export interface NetworkState {
  id: string;
  grade: string;
  address: string;
  name: string;
  type: string;
  timezone: string;
  gateway: any;
  units: Devices;
  groups: Array<any>;
  scenes: Array<any>;
  dimLevel: string;
  activeScenes: Array<any>;
}

interface Dictionary {
  [key: string]: string | boolean | number;
}

interface UnitChangedHandler {
  (state: any): void
}

interface UnitChangedHandlerId {
  deviceId: number;
  unitChangedCallback: UnitChangedHandler;
}

interface UnitChangedHandlerNetworkList {
  [key: string]: Array<UnitChangedHandlerId>;
}

export default class Client {
  protected token: string;

  protected username: string;

  protected password: string;

  protected networks?: NetworkList;

  protected wire = 1;

  protected sockets: SocketStates = {};

  protected headers: Dictionary = {
    'Content-Type': 'application/json',
  };

  protected isLoggingIn = false;

  protected unitChangedNetworkCallbacks: UnitChangedHandlerNetworkList = {};
  protected connectedDevices: { [key: string]: LuminaireDevice } = {};


  constructor(token: string, username: string, password: string) {
    this.token = token;
    this.username = username;
    this.password = password;

    this.headers['X-Casambi-Key'] = token;
  }

  async testCredentials(): Promise<boolean> {
    try {
      return !!await this.getNetworks();
    } catch {
      return false;
    }
  }

  async getNetworks(): Promise<NetworkList> {
    if (!this.isAuthenticated()) {
      await this.login();
    }

    if (!this.networks) {
      throw new Error('Still not authenticated');
    }

    return this.networks;
  }

  async getNetwork(networkId: string): Promise<Network> {
    return this.getNetworks().then((networks: NetworkList) => {
      // console.log('Searching network in networkList', networkId, networks);
      return networks[networkId];
    });
  }

  async getNetworkState(networkId: string): Promise<NetworkState> {
    const NETWORK_STATE_URL = `${BASE_URL}/networks/${networkId}/state`;
    const h = {
      ...this.headers,
      'X-Casambi-Session': (await this.getNetwork(networkId)).sessionId,
    };

    // console.log('getting devices from:', NETWORK_STATE_URL, 'with headers:', h);
    const response = await fetch(NETWORK_STATE_URL, {
      method: 'GET',
      headers: h,
    });

    if (!response.ok) {
      console.log('getting devices failed:', await response.text());
      throw new Error(`getting devices failed: ${await response.text()}`);
    }

    const networkState = await response.json() as NetworkState;

    console.log('getting devices succeeded!');
    // console.dir(networkState);

    return networkState;
  }

  async addUnitChangedHandler(networkId: string, deviceId: number, unitChangedCallback: UnitChangedHandler) {
    console.log(`Connecting socket for device to network ${networkId}`);

    const network = await this.getNetwork(networkId);
    const sessionKey = `${network.id}-${network.sessionId}`;
    if (!(sessionKey in this.unitChangedNetworkCallbacks)) {
      this.unitChangedNetworkCallbacks[sessionKey] = [];
    }

    this.unitChangedNetworkCallbacks[sessionKey].push({ deviceId, unitChangedCallback });
    this.getSocket(network); // connect if not already

    // unitChangedCallback(); // TODO: update data for current deviceId if present
  }

  async updateDeviceState(
    networkId: string,
    deviceId: number,
    targetControls: {}, // { Dimmer: { value: 0.5 } },
  ) {
    const network = await this.getNetwork(networkId);
    const socket = this.getSocket(network);
    console.log('Client.updateDeviceState', deviceId, targetControls, socket.readyState === WebSocket.OPEN);

    if (socket.readyState === WebSocket.OPEN) {
      const data = JSON.stringify({
        wire: this.wire,
        method: 'controlUnit',
        id: deviceId,
        targetControls,
      });

      socket.send(decodeURIComponent(escape(data)));
    }
  }

  protected getSocket(network: Network): WebSocket {
    const sessionKey = `${network.id}-${network.sessionId}`;

    if (!this.sockets[sessionKey]) {
      console.log(`Opening socket for networkId ${network.id} and sessionId ${network.sessionId}`);
      this.sockets[sessionKey] = new WebSocket('wss://door.casambi.com/v1/bridge/', this.token);
      const socket = this.sockets[sessionKey];

      // ping every 4 minutes to keep socket alive
      const timer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          // console.log('ping to keep alive: ', timer);
          const PING = JSON.stringify({
            method: 'ping',
            wire: this.wire,
          });

          socket.send(decodeURIComponent(escape(PING)));
        }
      }, 4 * 60 * 1000);

      socket.on('open', (event: WebSocket.Event): void => {
        const reference = 'REFERENCE-ID'; // Reference handle created by client to link messages to relevant callbacks
        const type = 1; // Client type, use value 1 (FRONTEND)

        const OPEN = JSON.stringify({
          method: 'open',
          id: network.id,
          session: network.sessionId,
          ref: reference,
          wire: this.wire,
          type,
        });
        socket.send(decodeURIComponent(escape(OPEN)));
      });

      socket.onmessage = (event: WebSocket.MessageEvent): void => {
        // console.log("webSocket.onmessage(event): ", event);

        const data = JSON.parse(event.data.toString());
        // console.log("webSocket.onmessage(event).data: ", data);

        if ('method' in data) {
          if (data.method === 'unitChanged') {
            // Initial device state info and device state changed event
            // In case data.id is not in "network.units" list (fetched via API)
            // this event can be ignored
            console.log("Client: webSocket.onmessage(event) method=unitChanged data: ", data);
            if (sessionKey in this.unitChangedNetworkCallbacks) {
              this.unitChangedNetworkCallbacks[sessionKey].forEach(({ deviceId, unitChangedCallback }) => {
                if (deviceId === data.id) {
                  unitChangedCallback(data);
                }
              }); // TODO: for devices else info log and store lateststate for later usage
            }
          } else if (data.method === 'networkUpdated') {
            // Network changed event, for example device added to a group within the network
            // Network setting or composition has somehow changed.
            // Fetching latest network information from REST API and
            // re-sending the OPEN message to WebSocket is recommended. *

          } else if (data.method === 'peerChanged') {
            // Devices online changed event, for example new device has joined the network
            // In most cases no action required.

          }
        }
      };

      socket.on('error', (event: WebSocket.ErrorEvent): void => {
        console.log('WebSocket Error (Reconnecting...):', event);

        this.reconnect(network, timer);
      });

      socket.onclose = (event: WebSocket.CloseEvent): void => {
        console.log('WebSocket Closed! Reconnecting...');

        this.reconnect(network, timer);
      };

      // } else {
      //   console.log(`Reusing socket for networkId ${network.id} with sessionId ${network.sessionId}`);
    }

    return this.sockets[sessionKey];
  }

  protected reconnect(network: Network, timer: NodeJS.Timer) {
    clearInterval(timer);
    delete this.sockets[`${network.id}-${network.sessionId}`];
    this.getSocket(network); // reconnect socket
  }

  protected isAuthenticated = (): boolean => {
    return !!this.networks; // TODO: && Date.now() < this.networks.expires_at;
  };

  protected async login(): Promise<NetworkList> {
    if (this.isLoggingIn) {
      // wait when already logging and retry returning result eventually
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.getNetworks();
    }

    this.isLoggingIn = true;
    delete this.headers['X-Casambi-Session'];

    const AUTHENTICATE_URL = `${BASE_URL}/networks/session`;
    // console.log('authenticating at: ', AUTHENTICATE_URL, {
    const response = await fetch(AUTHENTICATE_URL, {
      method: 'POST',
      body: JSON.stringify({
        email: this.username,
        password: this.password,
      }),
      headers: this.headers as HeaderInit,
    });

    if (!response.ok) {
      console.log(`authentication failed for ${this.username}: `, await response.text());
      throw new Error(`authentication failed: ${await response.text()}`);
    }

    this.networks = await response.json() as NetworkList;
    this.isLoggingIn = false;

    console.log(`authentication succeeded for ${this.username}`);
    // console.log(response.json, this.auth);

    return this.networks;
  }
}
