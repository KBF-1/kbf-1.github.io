# Genera un Cuadro de Envío (Última Milla) con la misma estructura que el de CESANTONI, con datos inventados.
# python3 tests/cuadro_envio.py salida.xlsm FOLIO LIGA
import sys, openpyxl
salida, folio, liga = sys.argv[1], sys.argv[2], sys.argv[3]
wb = openpyxl.Workbook(); c = wb.active; c.title = 'Cuadro de Envío'
c['E2'] = 'CUADRO DE ENVÍO'
c['B5'] = 'NO. DE FOLIO'; c['E5'] = int(folio); c['G5'] = 'NO. DE EMBARQUE'; c['J5'] = 600001; c['L5'] = 'PAGO DE FLETE DIRECTO'
c['B6'] = 'NO. DE ORDEN'; c['E6'] = 500001; c['G6'] = 'NO. DE FACTURA'; c['J6'] = 300001; c['L6'] = 'GRAN FORMATO'; c['N6'] = False
c['B7'] = 'NOMBRE DEL CLIENTE'; c['E7'] = 'CLIENTE DE PRUEBA'
c['B8'] = 'NOMBRE DE QUIEN RECIBE'; c['E8'] = 'PERSONA DE PRUEBA'
c['B9'] = 'TELÉFONO PRINCIPAL'; c['E9'] = '000 000 0000'; c['H9'] = 'TELÉFONO SECUNDARIO'
c['B10'] = 'CALLE'; c['E10'] = 'AV. DE PRUEBA'; c['H10'] = 'COLONIA'; c['K10'] = 'CENTRO'
c['B11'] = 'NO. INTERIOR'; c['H11'] = 'NO. EXTERIOR'; c['K11'] = 10
c['B12'] = 'CP'; c['E12'] = 98000; c['H12'] = 'LOCALIDAD'; c['K12'] = 'ZACATECAS'
c['B13'] = 'MUNICIPIO'; c['E13'] = 'ZACATECAS'
c['B14'] = 'LINK DE GOOGLE MAPS'; c['E14'] = liga
c['B15'] = 'OBSERVACIONES'; c['E15'] = 'LLAMAR ANTES DE LLEGAR'
c['B16'] = 'TIPO DE DESCARGA'; c['B17'] = 'DESCARGA MANUAL'; c['E17'] = True; c['I17'] = 'DESCARGA MONTACARGAS'
c['B18'] = 'DETALLES DE ENVÍO'; c['B19'] = 'PESO (KG)'; c['D19'] = 615.56; c['G19'] = 'METROS'; c['I19'] = 36.96; c['L19'] = 'ADHESIVOS'; c['N19'] = False
c['B20'] = 'MATERIAL ALMACÉN DISTINTO AL 2100'; c['G20'] = False
wb.save(salida)
