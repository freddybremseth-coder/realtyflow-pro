import { Calendar, ExternalLink } from "lucide-react";

const DEFAULT_APPOINTMENT_APP_URL = "http://localhost:4173/admin.html";

export default function BookingAdminPage() {
  const bookingAdminUrl = process.env.NEXT_PUBLIC_APPOINTMENT_ADMIN_URL || DEFAULT_APPOINTMENT_APP_URL;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/70 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-slate-500">
              <Calendar size={16} />
              Booking
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-white">Booking-admin</h1>
            <p className="mt-1 text-sm text-slate-400">
              Administrer bookingtypene for ZenEcoHomes, PinosoEcoLife, ChatGenius og FreddyBremseth.
            </p>
          </div>
          <a
            href={bookingAdminUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 hover:bg-slate-800"
          >
            Åpne i ny fane
            <ExternalLink size={15} />
          </a>
        </div>
      </div>
      <div className="h-[calc(100vh-105px)] bg-slate-950">
        <iframe
          title="Appointment booking admin"
          src={bookingAdminUrl}
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </main>
  );
}
