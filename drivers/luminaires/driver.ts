import Homey from 'homey';
import PairSession from 'homey/lib/PairSession';
import Client, { Auth, NetworkState } from '../../lib/client';

class LuminaireDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Casambi-luminaire driver has been initialized');
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

    session.setHandler('list_networks', async () => {
      return client.getNetworks().then((networks: Auth) => Object.values(Object.fromEntries(
        Object.entries(networks).map(([key, driver]) => [key, {
          ...driver,
          iconObj: { url: '/app/com.synplyworks.casambi/assets/network.svg' },
        }]),
      )));
    });

    session.setHandler('select_network_selection', async (data: Auth) => {
      networkId = data[0].id;
      this.log('select_network_selection ', networkId, data);

      return client.getNetworks()
        .then((networks: Auth) => Object.keys(networks).includes(networkId));
    });

    session.setHandler('list_devices', async () => {
      return client.getNetworks().then((networks: Auth) => {

        return client.getNetworkState(networkId).then((state: NetworkState) =>
          // this.log(state.units);
          Object.values(Object.fromEntries(
            Object.entries(state.units)
              .filter(([key, driver]) => driver.type === 'Luminaire')
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
                capabilities: ['onoff'],
                capabilitiesOptions: {},
              }]),
          )));
      });
    });
  }
}

module.exports = LuminaireDriver;
