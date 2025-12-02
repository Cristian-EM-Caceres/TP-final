import { exampleFlow } from "./todolist-parcial";

async function main() {
  try {
    console.log("EJECUTANDO exampleFlow()");
    await exampleFlow();
    console.log(" FIN ");
  } catch (err) {
    console.error("Error en ejecución:", err);
  }
}

main();
