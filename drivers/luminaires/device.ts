import Homey from 'homey';
import Client, { Auth } from '../../lib/client';
import CasambiApp from '../../app';

export default class LuminaireDevice extends Homey.Device {
  protected app?: CasambiApp;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.app = this.homey.app as unknown as CasambiApp;

    this.app.connectDevice(this);

    // register a capability listener
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.log('LuminaireDevice has been initialized');
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('LuminaireDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings: {}, newSettings: {}, changedKeys: [] }): Promise<string | void> {
    this.log('LuminaireDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('LuminaireDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('LuminaireDevice has been deleted');
  }

  // this method is called when the Device has requested a state change (turned on or off)
  async onCapabilityOnoff(value: boolean, opts: {}) {
    this.log(`LuminaireDevice ${this.getName()}: onoff is changed to `, value), this.getData();

    this.app!.updateDeviceState(this, { Dimmer: { value: +value } });

    // ... set value to real device, e.g.
    // await setMyDeviceState({ on: value });
    // or, throw an error
    // throw new Error('Switching the device failed!');
  }
}

module.exports = LuminaireDevice;
