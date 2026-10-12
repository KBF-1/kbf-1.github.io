# Genera un Formato de Acopio de prueba (comprimido, como lo guarda Excel) con las tres hojas.
import sys, openpyxl
wb = openpyxl.Workbook()
base = wb.active; base.title = 'Base'
base['A1'] = 'FORMATO DE ACOPIO'; base['A2'] = 'Semana 41'
base.append([])
base.append(['Pedido', 'Cliente', 'Destino', 'Producto', 'Cajas', 'Cajas x tarima', 'Peso (kg)'])
base.append(['12345A', 'Home Depot', 'Monterrey', 'Porcelanato 60x60', 120, 48, 3600])
base.append(['12346B', 'Home Depot', 'Monterrey', 'Porcelanato 80x80', 60, 40, 2100])
base.append(['22001', 'Interceramic Norte', 'Saltillo', 'Porcelanato 60x120', 400, 50, 38000])
base.append(['', None, None, 'Porcelanato 30x60', 90, 45, 4000])  # celdas combinadas: sigue el mismo cliente
base.append(['TOTAL', None, None, None, 670, None, 47700])
cb = wb.create_sheet('CB360')
cb.append(['Folio', 'Cliente', 'Ciudad', 'Tarimas', 'Peso'])
cb.append(['30010 Y 30011', 'Distribuidora Bajío', 'León', 3.5, 5200])
cb.append(['22001', 'Interceramic Norte', 'Saltillo', 2, 1500])
ex = wb.create_sheet('Exhibición')
ex.append(['FOLIO', 'CLIENTE', 'DESTINO', 'TARIMAS', 'PESO TON'])
ex.append(['40001', 'Showroom Polanco', 'CDMX', 1.25, 0.8])
wb.save(sys.argv[1])
