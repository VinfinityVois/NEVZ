# внутри update operation, после чтения body:
if data.get("status") == "completed" and not data.get("actual_end"):
    data["actual_end"] = datetime.now().strftime("%Y-%m-%d")
# если статус ушёл с completed — можно обнулить actual_end
if data.get("status") != "completed":
    # не затирай actual_end без нужды; либо:
    # data["actual_end"] = None
    pass