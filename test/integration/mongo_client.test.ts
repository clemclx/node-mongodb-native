import { expect } from 'chai';
import * as sinon from 'sinon';

import { MongoClient } from '../mongodb';

describe('MongoClient', () => {
  let client: MongoClient;
  let topologyOpenEvents;

  /** Keep track number of call to client connect to close as many as connect (otherwise leak_checker hook will failed) */
  let clientConnectCounter: number;

  /**
   * Wrap the connect method of the client to keep track
   * of number of times connect is called
   */
  function clientConnect() {
    if (!client) {
      return;
    }
    clientConnectCounter++;
    return client.connect();
  }

  beforeEach(async function () {
    client = this.configuration.newClient();
    topologyOpenEvents = [];
    clientConnectCounter = 0;
    client.on('open', event => topologyOpenEvents.push(event));
  });

  afterEach(async function () {
    // close `clientConnectCounter` times
    const clientClosePromises = Array.from({ length: clientConnectCounter }, () => client.close());
    await Promise.all(clientClosePromises);
  });

  it('parallel client connect calls only create one topology', async function () {
    await Promise.all([clientConnect(), clientConnect(), clientConnect()]);

    expect(topologyOpenEvents).to.have.lengthOf(1);
    expect(client.topology?.isConnected()).to.be.true;
  });

  it('Failed client connect must properly release lock', async function () {
    const internalConnectStub = sinon.stub(client, '_connect' as keyof MongoClient);
    internalConnectStub.onFirstCall().rejects();

    // first call rejected to simulate a connection failure
    try {
      await clientConnect();
    } catch (err) {
      expect(err).to.exist;
    }

    internalConnectStub.restore();

    // second call should connect
    try {
      await clientConnect();
    } catch (err) {
      expect.fail(`client connect throwed unexpected error`);
    }

    expect(topologyOpenEvents).to.have.lengthOf(1);
    expect(client.topology?.isConnected()).to.be.true;
  });
});
