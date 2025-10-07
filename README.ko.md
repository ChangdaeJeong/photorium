# 포토리움 (Photorium)

포토리움은 당신의 PC에서 로컬로 실행되는 간단한 셀프 호스팅 사진 및 동영상 컬렉션 관리 프로그램입니다.

## 주요 기능

- 여러 폴더를 추가하여 나만의 컬렉션을 만들 수 있습니다.
- 모든 미디어를 날짜순으로 정렬된 아름다운 갤러리에서 볼 수 있습니다.
- 위치 정보를 포함한 이미지의 상세 메타데이터를 확인할 수 있습니다.
- 갤러리 격자 크기를 원하는 대로 조절할 수 있습니다.
- ... 등 다양한 기능이 있습니다!

## 사용 방법

### 사용자용

1.  [릴리즈](https://github.com/ChangdaeJeong/photorium/releases) 페이지로 이동하세요.
2.  최신 `Photorium.exe` 파일을 다운로드하세요.
3.  실행 파일을 더블클릭하여 서버를 시작하세요.
4.  웹 브라우저를 열고 `http://127.0.0.1:5000` 주소로 접속하세요.

### 개발자용

1.  저장소 복제: `git clone https://github.com/ChangdaeJeong/photorium.git`
2.  가상 환경 생성 및 활성화: `python -m venv .venv` 후 `.venv\Scripts\activate` 실행
3.  의존성 설치: `pip install -r requirements.txt`
4.  Flask 서버 실행: `python app.py`