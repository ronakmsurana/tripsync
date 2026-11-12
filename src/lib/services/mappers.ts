// DB rows -> API DTOs (dates as strings, money as exact decimal strings)
import { Prisma } from "@prisma/client";
import { AccommodationDTO, DestinationDTO, TransportDTO } from "@/types";
import { decimalToString } from "@/lib/utils/money";
import { formatDateOnly, formatLocalDateTime } from "@/lib/utils/time";

type Dest = Prisma.DestinationGetPayload<object>;
type Transport = Prisma.TransportGetPayload<{ include: { departureDestination: { select: { name: true; location: true } }; arrivalDestination: { select: { name: true; location: true } } } }>;
type Accom = Prisma.AccommodationGetPayload<{ include: { destination: { select: { name: true; location: true } } } }>;

export const transportInclude = {
  departureDestination: { select: { name: true, location: true } },
  arrivalDestination: { select: { name: true, location: true } },
} as const;
export const accommodationInclude = { destination: { select: { name: true, location: true } } } as const;

export const destinationDTO = (d: Dest): DestinationDTO => ({
  destinationId: d.destinationId, tripId: d.tripId, name: d.name, location: d.location,
  arrivalDate: formatDateOnly(d.arrivalDate), departureDate: formatDateOnly(d.departureDate), notes: d.notes,
});

export const transportDTO = (t: Transport): TransportDTO => ({
  transportId: t.transportId, tripId: t.tripId, transportType: t.transportType, provider: t.provider,
  departureDestinationId: t.departureDestinationId, arrivalDestinationId: t.arrivalDestinationId,
  departureDestination: t.departureDestination, arrivalDestination: t.arrivalDestination,
  departureTime: formatLocalDateTime(t.departureTime), arrivalTime: formatLocalDateTime(t.arrivalTime),
  bookingReference: t.bookingReference, cost: decimalToString(t.cost), status: t.status,
});

export const accommodationDTO = (a: Accom): AccommodationDTO => ({
  accommodationId: a.accommodationId, tripId: a.tripId, destinationId: a.destinationId, name: a.name, address: a.address,
  destination: a.destination, checkIn: formatLocalDateTime(a.checkIn), checkOut: formatLocalDateTime(a.checkOut),
  bookingReference: a.bookingReference, cost: decimalToString(a.cost), status: a.status,
});
