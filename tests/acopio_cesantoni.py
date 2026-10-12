# Genera un Formato de Acopio con la estructura de la macro de CESANTONI («Nueva Development v6»), con datos inventados.
# python3 tests/acopio_cesantoni.py salida.xlsm FOLIO
import sys, openpyxl
salida, folio = sys.argv[1], sys.argv[2]
wb = openpyxl.Workbook()
ex = wb.active; ex.title = 'Exhibición'
ex['A1'] = 'FORMATO DE ACOPIO Y CARGADO DE EMBARQUE'; ex['A2'] = 'EXHIBICIÓN'; ex['B4'] = 'Peso total (Tons):'; ex['C4'] = 0.5
for c, t in zip('ABCDE', ['Cantidad', 'Peso (kgs)', 'Folio ', 'Espacios', 'Descripción']): ex[c + '6'] = t
ex.append([1, 500, folio, 1, 'Exhibidor de prueba'])
cb = wb.create_sheet('CB360')
cb['A1'] = 'FORMATO DE ACOPIO Y CARGADO DE EMBARQUE'; cb['A2'] = 'CB360 PRODUCTO FACTURADO'; cb['B4'] = 'Peso total (Tons):'; cb['C4'] = 0
for c, t in zip('ABCDEFGHIJ', ['OC', 'SKU', 'Almacén', 'Lote', 'Ubicación', 'Descripción 1', 'Descripción2', 'Cantidad', 'Factura', 'Peso (kgs)']): cb[c + '6'] = t
b = wb.create_sheet('Base')
b['A1'] = 'FORMATO DE ACOPIO Y CARGADO DE EMBARQUE'; b['A2'] = 'Folio:'; b['B2'] = folio if not folio.isdigit() else int(folio)
b['G2'] = 'Clasificación:'; b['E3'] = 'Tonelaje:'; b['F3'] = 41.0; b['G3'] = 'C'
tit = ['Número orden', 'Tp ord', 'Número principal', 'Venta', 'Destino envío', 'Nombre venta', '2º nº artículo', 'Descripción 1', 'Línea descripción 2',
       'Cantidad enviada', 'UM', 'Suc/planta', 'Nº lote /serie', 'Ubicación', 'Número acopio', 'Número entrega', 'Último estado', 'Estado sig', 'OC cliente',
       'Lis/Dec', 'Formato', 'Generico', 'Producto', 'Cant enviada', 'Kg.', 'Destino', '1', 'Factor Tarimas', 'Factor Piezas', 'Tarimas',
       'Restos tarima - liso', 'Restos tarima - deco', 'Cajas', 'Piezas', 'Piezas a cajas', 'Cliente', 'Nom Sucursal', 'Cd Cliente', 'Cd Sucursal',
       'Estatus', 'Lote físico', 'Lote mixto', 'Color Mes', 'Mts']
for i, t in enumerate(tit): b.cell(6, i + 1, t)
def fila(orden, dest, ciudad, suc, kgs, tar, liso, deco):
    r = {t: '' for t in tit}
    r.update({'Número orden': orden, 'Destino envío': dest, 'Nombre venta': 'CLIENTE PRUEBA', 'Cant enviada': 10, 'Kg.': kgs, 'Destino': ciudad,
              'Tarimas': tar, 'Restos tarima - liso': liso, 'Restos tarima - deco': deco, 'Cliente': 'CLIENTE PRUEBA SA DE CV',
              'Nom Sucursal': suc, 'Cd Sucursal': ciudad, 'Mts': 100})
    b.append([r[t] for t in tit])
fila(1001, 9001, 'LEON', 'PRUEBA Suc. LEON', 20000, 10, 3, 0)
fila(1002, 9001, 'LEON', 'PRUEBA Suc. LEON', 6000, 3, 0, 2)
fila(1003, 9002, 'QUERETARO', 'PRUEBA Suc. QRO', 15000, 8, 0, 0)
lg = wb.create_sheet('logistica'); lg['A1'] = 'FORMATO DE ACOPIO Y CARGADO DE EMBARQUE'; lg['H1'] = 'Folio:'; lg['I1'] = b['B2'].value
wb.save(salida)
