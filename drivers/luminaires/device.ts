import Homey from 'homey';
import CasambiApp from '../../app';

export default class LuminaireDevice extends Homey.Device {
  protected app?: CasambiApp;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.app = this.homey.app as unknown as CasambiApp;

    await this.app.connectDevice(this);

    this.registerMultipleCapabilityListener(['onoff', 'dim'], async ({ onoff, dim }) => {
      if (onoff === false) {
        await this.app!.updateDeviceState(this, { Dimmer: { value: 0 } });
      } else if (onoff === true) {
        await this.app!.updateDeviceState(this, { Dimmer: { value: 1 } });
      } else {
        await this.app!.updateDeviceState(this, { Dimmer: { value: dim } });
      }
    });

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

  updateState(state: any) {
    console.log('LuminaireDevice.updateState with state: ', state);

    if ('dimLevel' in state && state.dimLevel != undefined) {
      if (!(state.dimLevel)) {
        this.setCapabilityValue('onoff', false);
      } else {
        this.setCapabilityValue('onoff', true);
        this.setCapabilityValue('dim', state.dimLevel);
      }
    } else {
      console.log('LuminaireDevice.updateState! Could not update, no dimlevel in state!', state);
    }
  }
}

module.exports = LuminaireDevice;
