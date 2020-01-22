class VectorClock {
  currentTime: number = 0;
  onTimeChangeSubscribers: Array<()=>any> = [];

  moveTimeForward() {
    this.currentTime += 1;
    this.onTimeChangeSubscribers.forEach(subscriber => {
      subscriber()
    })
  }

  onTimeChange(callbackFn: () => any) {
    this.onTimeChangeSubscribers.push(callbackFn)
  }
}

interface Shipment {
  destination: Actor
}

interface FutureEvent {
  eventType: string
  location: string
  carrier: string,
  cargo: Shipment
  time: number
}

class EventStore {
  events: FutureEvent[] = [];

  addFutureEvent(event: FutureEvent) {
    this.events.push(event)
  }

  getEventsForTime(time: number): FutureEvent[] {
    return this.events.filter(event => event.time === time)
  }
}


abstract class Actor {
  identifier: string;
  clock: VectorClock;
  eventStore: EventStore;

  constructor(identifier: string, time: VectorClock, eventStore: EventStore) {
    this.identifier = identifier;
    this.clock = time;
    this.eventStore = eventStore;
    this.onTimeChange = this.onTimeChange.bind(this)
    this.clock.onTimeChange(this.onTimeChange);

  }
  onTimeChange() {}
}

class EndDestination extends Actor {
  shipmentsReceived: Shipment[] = [];

  onTimeChange() {
    this.eventStore
      .getEventsForTime(this.clock.currentTime)
      .filter(event => event.location === this.identifier)
      .map((arrivedShipmentEvent) => {
        this.shipmentsReceived.push(arrivedShipmentEvent.cargo)
    });
  }
}

class Factory extends Actor {

  shipmentQueue: Shipment[] = []
  availableTrucks: string[]

  constructor(identifier: string, time: VectorClock, eventStore: EventStore, availableTrucks: string[], shipments: Shipment[]) {
    super(identifier, time, eventStore);
    this.availableTrucks = availableTrucks
    this.shipmentQueue = shipments
  }

  onTimeChange() {
    this.eventStore
      .getEventsForTime(this.clock.currentTime)
      .filter(event => event.location === this.identifier && !event.cargo)
      .map(arrivedTruckInFactoryEvent => {
        this.availableTrucks.push(arrivedTruckInFactoryEvent.carrier)
      });

    while(this.shipmentQueue.length > 0 && this.availableTrucks.length > 0) {
      // send out trucks until either no shipments need to be done or all trucks are gone
      const shipment = this.shipmentQueue.pop()
      const truck = this.availableTrucks.pop()
      // route based on final destination (A needs to go to port)
      const shipmentDuration = shipment.destination.identifier === 'b' ? 5 : 1;
      const shipmentNextHop = shipment.destination.identifier === 'a' ? 'port' : 'b';

      this.eventStore.addFutureEvent({
        eventType: 'arrived',
        location: shipmentNextHop,
        time: this.clock.currentTime + shipmentDuration,
        carrier: truck,
        cargo: shipment
      });

      // truck will return again in 2x shipmentDuration to current location
      this.eventStore.addFutureEvent({
        eventType: 'arrived',
        location: this.identifier,
        time: this.clock.currentTime + (shipmentDuration * 2),
        carrier: truck,
        cargo: null
      })
    }
  }
}

class Port extends Actor {

  cargoToBeShiped: Shipment[] = []
  availableShips: string[]

  constructor(identifier: string, time: VectorClock, eventStore: EventStore, availableShips: string[]) {
    super(identifier, time, eventStore);
    this.availableShips = availableShips;
  }

  onTimeChange() {
    // handle returning ships
    this.eventStore
      .getEventsForTime(this.clock.currentTime)
      .filter(event => event.location === this.identifier && !event.cargo)
      .map(arrivedShipInPortEvent => {
        this.availableShips.push(arrivedShipInPortEvent.carrier)
      });

    // handle arriving cargo by truck
    this.eventStore
      .getEventsForTime(this.clock.currentTime)
      .filter(event => event.location === this.identifier && event.cargo)
      .map(arrivedTruckInPortEvent => {
        this.cargoToBeShiped.push(arrivedTruckInPortEvent.cargo)
      });

    // send out new ships (if possible)
    while(this.cargoToBeShiped.length > 0 && this.availableShips.length > 0) {
      // send out trucks until either no shipments need to be done or all ships are gone
      const shipment = this.cargoToBeShiped.pop();
      const ship = this.availableShips.pop();
      const shipmentDuration = 4;
      const shipmentNextHop = 'A'; // ship only goes to A

      this.eventStore.addFutureEvent({
        eventType: 'arrived',
        location: shipmentNextHop,
        time: this.clock.currentTime + shipmentDuration,
        carrier: ship,
        cargo: shipment
      });

      // ship will return again in 2x shipmentDuration to current location (without cargo)
      this.eventStore.addFutureEvent({
        eventType: 'arrived',
        location: this.identifier,
        time: this.clock.currentTime + (shipmentDuration * 2),
        carrier: ship,
        cargo: null
      })
    }
  }
}


const vectorClock = new VectorClock()
const eventStore = new EventStore();
const recipientB = new EndDestination('b', vectorClock, eventStore)
const recipientA = new EndDestination('a', vectorClock, eventStore)

new Factory(
  'factory',
  vectorClock,
  eventStore,
  ['truck-1', 'truck-2'],
  [{destination: recipientA}, {destination: recipientB}, {destination: recipientB}])

new Port(
  'port',
  vectorClock,
  eventStore,
  ['ship-1']
);

while(recipientA.shipmentsReceived.length !== 1 && recipientB.shipmentsReceived.length !==2) {
  vectorClock.moveTimeForward()
}

console.log(`Took ${ vectorClock.currentTime - 1 } time-units to ship all products`)
