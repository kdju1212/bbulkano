from config import JSON_FILES, OUTPUT_FILE
from services.pipeline import ReportPipeline


def main() -> None:
    pipeline = ReportPipeline()
    pipeline.run(JSON_FILES, OUTPUT_FILE)
    print(f"완료: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
