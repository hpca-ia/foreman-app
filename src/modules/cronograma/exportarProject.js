// Bajar el cronograma para abrirlo en MS Project.
//
// El formato es el XML nativo de Project, que es el que la gente de verdad
// usa para intercambiar: se abre con doble clic y entra con sus tareas, sus
// duraciones, sus dependencias y su calendario. No es .mpp —ese es cerrado y
// no se puede escribir sin la librería de Microsoft— y no es CSV, que entra
// como una lista de nombres y obliga a reconstruir las dependencias a mano,
// que es justo el trabajo que uno quería ahorrarse.
//
// También lo abren Primavera, ProjectLibre y GanttProject, así que sirve para
// mandárselo a una fiscalización que trabaja con otra herramienta.
//
// PARA QUÉ, si el cronograma vive acá: porque a veces hay que entregarlo. Una
// fiscalización lo pide en Project, un cliente corporativo lo quiere en su
// formato, y un contrato público lo exige. Negarse a eso obliga a llevar dos
// cronogramas, y el segundo siempre queda viejo.

import { aFecha, claveFecha } from "./cpm";

const esc = t => String(t ?? "").replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));

// Project habla en horas, no en días: una tarea de 5 días con jornada de 8 son
// PT40H0M0S. Si se le manda "5 días" sin más, los interpreta con SU calendario
// y las fechas se corren.
const dur = (dias, jornada = 8) => `PT${Math.max(1, Math.round(dias)) * jornada}H0M0S`;

// Project quiere la fecha con hora. El inicio a las 8 y el fin a las 17, que
// es lo que espera de una jornada normal; sin hora, algunas versiones ponen
// medianoche y la tarea aparece un día corrida.
const fecha = (f, hora = "08:00:00") => (f ? `${claveFecha(f)}T${hora}` : "");

/**
 * El XML del cronograma.
 *
 * @param actividades  las que devuelve `calcular`, con inicio, fin y duración
 * @param dependencias [{ actividad_id, depende_de_id, tipo, retardo }]
 * @param cal          el calendario de la obra, para escribir sus días hábiles
 */
export function xmlDeProject({ nombre = "Cronograma", actividades = [], dependencias = [], inicio, fin, cal, jornada = 8 }) {
  // Project numera las tareas desde 1 y usa su UID para las dependencias.
  const uid = new Map(actividades.map((a, i) => [a.id, i + 1]));

  const laborables = cal?.laborables || [1, 2, 3, 4, 5, 6];
  // En Project el día 1 es domingo; acá 0 es domingo. De ahí el +1.
  const diasSemana = Array.from({ length: 7 }, (_, d) => {
    const trabaja = laborables.includes(d);
    return `        <WeekDay>
          <DayType>${d + 1}</DayType>
          <DayWorking>${trabaja ? 1 : 0}</DayWorking>
          ${trabaja ? `<WorkingTimes>
            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>
            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>
          </WorkingTimes>` : ""}
        </WeekDay>`;
  }).join("\n");

  // Los feriados, como excepciones del calendario: sin esto Project los
  // trabaja y devuelve una obra más corta que la que uno planificó.
  const feriados = (cal?.feriados || []).map((f, i) => {
    const d = claveFecha(f);
    return `        <WeekDay>
          <DayType>0</DayType>
          <DayWorking>0</DayWorking>
          <TimePeriod><FromDate>${d}T00:00:00</FromDate><ToDate>${d}T23:59:00</ToDate></TimePeriod>
        </WeekDay>`;
  }).join("\n");

  const tareas = actividades.map((a, i) => {
    const suyas = dependencias.filter(d => d.actividad_id === a.id && uid.has(d.depende_de_id));
    const enlaces = suyas.map(d => `        <PredecessorLink>
          <PredecessorUID>${uid.get(d.depende_de_id)}</PredecessorUID>
          <Type>${d.tipo === "CC" ? 3 : d.tipo === "FF" ? 0 : 1}</Type>
          <LinkLag>${(Number(d.retardo) || 0) * jornada * 600}</LinkLag>
          <LagFormat>7</LagFormat>
        </PredecessorLink>`).join("\n");
    return `      <Task>
        <UID>${uid.get(a.id)}</UID>
        <ID>${i + 1}</ID>
        <Name>${esc(a.nombre)}</Name>
        <Active>1</Active>
        <Manual>0</Manual>
        <Type>1</Type>
        <Start>${fecha(a.inicio)}</Start>
        <Finish>${fecha(a.fin, "17:00:00")}</Finish>
        <Duration>${dur(a.duracion, jornada)}</Duration>
        <DurationFormat>7</DurationFormat>
        <PercentComplete>${Math.round(Number(a.avance_pct) || 0)}</PercentComplete>
        <Critical>${a.critica ? 1 : 0}</Critical>
        <TotalSlack>${Math.round((Number(a.holgura) || 0) * jornada * 600)}</TotalSlack>
${enlaces}
      </Task>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${esc(nombre)}</Name>
  <Title>${esc(nombre)}</Title>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${fecha(inicio)}</StartDate>
  <FinishDate>${fecha(fin, "17:00:00")}</FinishDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>${jornada * 60}</MinutesPerDay>
  <MinutesPerWeek>${jornada * 60 * laborables.length}</MinutesPerWeek>
  <DaysPerMonth>${laborables.length * 4}</DaysPerMonth>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Calendario de obra</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <WeekDays>
${diasSemana}
${feriados}
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>
${tareas}
  </Tasks>
</Project>`;
}

/** Bajarlo como archivo. */
export function bajarProject(datos) {
  const xml = xmlDeProject(datos);
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(datos.nombre || "Cronograma").replace(/[^\w\s.-]/g, "")}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export { aFecha };
