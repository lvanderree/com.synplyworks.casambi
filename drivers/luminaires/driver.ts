import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import Client, { NetworkList, NetworkState } from '../../lib/client';

export default class LuminaireDriver extends Homey.Driver {
  protected supportedTypes: {
    [type: string]: {
      capabilities: string[];
      class: string
    }
  } = {};

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Casambi-LuminaireDriver has been initialized');

    this.supportedTypes = {
      Luminaire: {
        class: 'light',
        capabilities: ['onoff', 'dim'],
      },
    };
  }

  async onPair(session: PairSession) {
    let username = '';
    let password = '';
    let networkId = '';

    let client: Client;

    session.setHandler('login', async (data: { username: string, password: string }) => {
      username = data.username;
      password = data.password;

      client = new Client(Homey.env.API_KEY, username, password);

      // return true to continue adding the device if the login succeeded
      // return false to indicate to the user the login attempt failed
      // thrown errors will also be shown to the user
      return client.testCredentials();
    });

    session.setHandler('list_networks', async () => client.getNetworks().then((networks: NetworkList) => Object.values(Object.fromEntries(
      Object.entries(networks).map(([key, driver]) => [key, {
        ...driver,
        iconObj: { url: '/app/com.synplyworks.casambi/assets/network.svg' },
      }]),
    ))));

    session.setHandler('select_network_selection', async (data: NetworkList) => {
      networkId = data[0].id;
      this.log('select_network_selection ', networkId, data);

      return client.getNetworks()
        .then((networks: NetworkList) => Object.keys(networks).includes(networkId));
    });

    session.setHandler('list_devices', async () => client.getNetworks().then((networks: NetworkList) => client.getNetworkState(networkId).then((state: NetworkState) => {
      // this.log(JSON.stringify(state.units, null, 4));

      type CasambiType = keyof typeof this.supportedTypes;

      return Object.values(Object.fromEntries(
        Object.entries(state.units)
          .filter(([key, driver]) => driver.type in this.supportedTypes)
          .map(([key, driver]) => [key, {
            name: driver.name,
            data: {
              network_id: networkId,
              id: driver.id,
              address: driver.address,
            },
            settings: {
              // Store username & password in settings
              // so the user can change them later
              username,
              password,
            },
            capabilities: this.supportedTypes[driver.type as CasambiType].capabilities,
            capabilitiesOptions: {},
            class: this.supportedTypes[driver.type as CasambiType].class,
          }]),
      ));
    })));
  }
}

module.exports = LuminaireDriver;
