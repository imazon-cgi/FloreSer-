import pandas as pd

def xlsx_to_csv(input_path, output_path):
    try:
        # Carregar o arquivo XLSX
        excel_data = pd.ExcelFile(input_path)
        
        # Iterar sobre cada planilha e salvar como CSV
        for sheet_name in excel_data.sheet_names:
            df = excel_data.parse(sheet_name)
            csv_path = f"{output_path}/{sheet_name}.csv"
            df.to_csv(csv_path, index=False)
            print(f"Planilha '{sheet_name}' convertida para: {csv_path}")
        print("Conversão concluída com sucesso!")
    except Exception as e:
        print(f"Erro ao converter arquivo: {e}")

# Caminhos específicos para o seu caso
input_path =  '../database/floreser-9-22-1-ages-sf-mun-state.xlsx'
output_path = r'F:\VSCode\13 - MUNDO\florser\dataset'
xlsx_to_csv(input_path, output_path)
