# Genera catálogos de ejemplo con la estructura de «Seguimiento Integral Logística» (hoja Catalogos) y «Fletes» (hoja CATALOGOS).
# python3 tests/catalogos_ejemplo.py seguimiento.xlsx fletes.xlsx   (datos inventados)
import sys, openpyxl
seg = openpyxl.Workbook(); c = seg.active; c.title = 'Catalogos'
c['D1'] = 'Transportista'; c['S1'] = 'Destinos'
for col, t in {'A': 'Operador', 'D': 'NUM', 'E': 'TRANSPORTISTA', 'F': 'RAZON SOCIAL', 'G': 'TELÉFONO', 'H': 'CORREO', 'I': 'CORREO 2', 'P': 'NUMERO', 'Q': 'TIPO UNIDAD',
               'S': 'CIUDAD', 'T': 'DIAS', 'U': 'TARIFA', 'V': 'ESTADOS', 'X': 'Num Cliente', 'Y': 'Nombre Cliente', 'Z': 'Corporativo', 'AA': 'Customer Service',
               'AB': 'Cita', 'AC': 'Gerente Regional', 'AD': 'Gerente Divisional', 'AE': 'Zona', 'AF': 'No. Zona', 'AG': 'Tipo Flete', 'AH': 'Dias Crédito', 'AI': 'Observaciones'}.items():
    c[col + '2'] = t
filas = [
  {'E': 'Fletes del Bajío', 'F': 'FLETES DEL BAJIO S.A. DE C.V.', 'G': '4770000000', 'H': 'trafico@fletes.example', 'S': 'SALTILLO', 'T': 1, 'U': 530, 'V': 'COAHUILA',
   'X': 9101, 'Y': 'Interceramic Norte', 'Z': 'INTERCERAMIC', 'AA': 'ANA PRUEBA', 'AB': 'SI', 'AE': 'NORTE', 'AF': 'ZN7', 'AG': 'Cliente'},
  {'E': 'Transportes Ejemplo', 'F': 'JUAN EJEMPLO PEREZ', 'G': '4771111111', 'S': 'MONTERREY', 'T': 2, 'U': 600, 'V': 'NUEVO LEON',
   'X': 9102, 'Y': 'Home Depot', 'AA': 'LUIS PRUEBA', 'AE': 'NORESTE'},
  {'S': 'CDMX', 'T': 1, 'U': 750, 'V': 'CIUDAD DE MEXICO', 'Y': 'Showroom Polanco', 'AA': 'EVA PRUEBA', 'AE': 'CENTRO'},
  {'S': 'LEON', 'T': '#N/A', 'U': 250, 'V': 'GUANAJUATO'},
]
for i, f in enumerate(filas):
    for col, v in f.items(): c[col + str(3 + i)] = v
seg.save(sys.argv[1])
fl = openpyxl.Workbook(); d = fl.active; d.title = 'CATALOGOS'
d['I3'] = 'CATALOGOS'
for col, t in {'B': 'DESTINO', 'C': 'TARIFA', 'D': 'TARIFA LP', 'G': 'NUM CLIENTE', 'H': 'NOMBRE CLIENTE', 'I': 'CLASIFICACION', 'K': 'RAZON SOCIAL TRANSPORTISTA', 'L': 'PLAZO PAGO', 'M': 'CORREO', 'N': 'Calculo IVA'}.items():
    d[col + '10'] = t
for i, f in enumerate([
  {'B': 'SALTILLO', 'C': 560, 'D': 530, 'G': 9101, 'H': 'INTERCERAMIC NORTE', 'I': 'NACIONAL', 'K': 'FLETES DEL BAJIO', 'L': 30, 'M': 'pagos@fletes.example', 'N': 1.12},
  {'B': 'MONTERREY', 'C': 600, 'D': 600, 'G': 9103, 'H': 'SHOWROOM POLANCO', 'I': 'SIN FLETE', 'K': 'JUAN EJEMPLO PEREZ', 'L': 60, 'N': 1.12},
]):
    for col, v in f.items(): d[col + str(11 + i)] = v
fl.save(sys.argv[2])
