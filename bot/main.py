from dotenv import load_dotenv

from graph import build_graph


def main():
    load_dotenv()
    app = build_graph()
    result = app.invoke({"user_input": "Hola bot"})
    print(result.get("response", "Sin respuesta"))


if __name__ == "__main__":
    main()
