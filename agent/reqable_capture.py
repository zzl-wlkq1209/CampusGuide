from reqable import *
import os

TARGET = "/cda-mini-program/userAuthorization.do"
OUTPUT = os.environ.get(
    "CREDENTIAL_CAPTURE_FILE",
    os.path.join(os.path.expanduser("~"), "CampusGuide", "credential-response.json"),
)


def onRequest(context, request):
    return request


def onResponse(context, response):
    if context.host == "mini.99cda.com" and TARGET in context.url:
        os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
        temporary = OUTPUT + ".tmp"
        response.body.writeFile(temporary)
        os.replace(temporary, OUTPUT)
    return response
