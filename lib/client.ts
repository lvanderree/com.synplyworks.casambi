import fetch, { HeaderInit } from 'node-fetch';
import WebSocket from 'ws';

export const BASE_URL = 'https://door.casambi.com/v1';

export interface Network {
  id: string;
  mac: string;
  name: string;
  type: string;
  grade: string;
  sessionId: string;
}

export interface Auth {
  [id: string]: Network;
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

export default class Client {
  protected token: string;

  protected username: string;

  protected password: string;

  protected auth?: Auth;

  protected wire = 1;

  protected headers: Dictionary = {
    'Content-Type': 'application/json',
  };

  constructor(token: string, username: string, password: string) {
    this.token = token;
    this.username = username;
    this.password = password;

    this.headers['X-Casambi-Key'] = token;
  }

  async testCredentials(): Promise<boolean> {
    try {
      return !!await this.login();
    } catch {
      return false;
    }
  }

  async getNetworks(): Promise<Auth> {
    if (!this.isAuthenticated()) {
      await this.login();
    }

    if (!this.auth) {
      throw new Error('Still not authenticated');
    }
    return this.auth;
  }

  async getNetworkState(networkId: string): Promise<NetworkState> {
    if (!this.isAuthenticated()) {
      await this.login();
    }

    const NETWORK_STATE_URL = `${BASE_URL}/networks/${networkId}/state`;
    const h = {
      ...this.headers,
      'X-Casambi-Session': (await this.getNetworks())[networkId].sessionId,
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

  connectSocket(network: Network): WebSocket {
    const webSocket = new WebSocket('wss://door.casambi.com/v1/bridge/', this.token);

    webSocket.on('open', (event: WebSocket.Event): void => {
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
      webSocket.send(decodeURIComponent(escape(OPEN)));
    });

    webSocket.on('error', (event: WebSocket.ErrorEvent): void => {
      console.log('WebSocket Error:', event);

      // TODO: REOPEN the WebSocket connection and all related wires.
    });

    webSocket.onclose = (event: WebSocket.CloseEvent): void => {
      console.log('WebSocket Closed!');

      // TODO: REOPEN the WebSocket connection and all related wires.
    };

    webSocket.onmessage = (event: WebSocket.MessageEvent): void => {
      // console.log("webSocket.onmessage(event): ", event);

      const data = JSON.parse(event.data.toString());
      console.log("webSocket.onmessage(event).data: ", data);

      if ('method' in data) {
        if (data.method === 'unitChanged') {
          // Initial device state info and device state changed event
          // In case data.id is not in "network.units" list (fetched via API)
          // this event can be ignored
          // TODO: for listeners in array on this socket, notify with data

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

    // ping every 4 minutes to keep socket alive
    setInterval(() => {
      if (webSocket.readyState === webSocket.OPEN) {
        const PING = JSON.stringify({
          method: 'ping',
          wire: this.wire,
        });

        webSocket.send(decodeURIComponent(escape(PING)));
      }
    }, 4 * 60 * 1000);

    return webSocket;
  }

  updateDeviceState(
    webSocket: WebSocket,
    deviceId: number,
    targetControls: {}, // { Dimmer: { value: 0.5 } },
  ): void {
    console.log('updateDeviceState', deviceId, targetControls, webSocket.readyState === webSocket.OPEN);
    if (webSocket.readyState === webSocket.OPEN) {
      const data = JSON.stringify({
        wire: this.wire,
        method: 'controlUnit',
        id: deviceId,
        targetControls,
      });

      webSocket.send(decodeURIComponent(escape(data)));
    }
  }

  protected isAuthenticated = (): boolean => !!this.auth
  /* && (Date.now() < this.auth.expires_at) */
  ;

  protected getUnixTimestampSeconds = (): number => Math.round(Date.now() / 1000);

  protected async login(): Promise<Auth> {
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
      console.log('authentication failed:', await response.text());
      throw new Error(`authentication failed: ${await response.text()}`);
    }

    this.auth = await response.json() as Auth;
    // console.log('authentication succeeded');
    // console.log(auth);
    // auth['expires_at'] = (auth.expires_in - 20) * 3600 + this.getUnixTimestampSeconds();

    return this.auth;
  }
}
