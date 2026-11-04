import threading
import time

import pytest
from starlette.requests import Request

from f1analytics.api.limites import LimitadorConcurrencia, LimitadorPorIp, ip_del_cliente
from f1analytics.datos.errores import ErrorDatos


class Reloj:
    def __init__(self):
        self.segundos = 1000.0

    def __call__(self) -> float:
        return self.segundos


def peticion(cabeceras: dict[str, str] | None = None, cliente=("10.0.0.1", 1234)) -> Request:
    return Request(
        {
            "type": "http",
            "headers": [(k.lower().encode(), v.encode()) for k, v in (cabeceras or {}).items()],
            "client": cliente,
        }
    )


# --- LimitadorPorIp ------------------------------------------------------------------


def test_deja_pasar_hasta_el_maximo_y_luego_lanza_limite_peticiones():
    limitador = LimitadorPorIp(maximo=3)

    for _ in range(3):
        limitador.consumir("1.1.1.1")

    with pytest.raises(ErrorDatos) as error:
        limitador.consumir("1.1.1.1")
    assert error.value.codigo == "limite_peticiones"


def test_cada_ip_tiene_su_propio_cupo():
    limitador = LimitadorPorIp(maximo=1)

    limitador.consumir("1.1.1.1")
    limitador.consumir("2.2.2.2")

    with pytest.raises(ErrorDatos):
        limitador.consumir("1.1.1.1")


def test_el_cupo_se_recupera_cuando_pasa_la_ventana():
    reloj = Reloj()
    limitador = LimitadorPorIp(maximo=2, ventana_s=60, reloj=reloj)
    limitador.consumir("ip")
    reloj.segundos += 30
    limitador.consumir("ip")
    with pytest.raises(ErrorDatos):
        limitador.consumir("ip")

    reloj.segundos += 30  # el primero cumple 60 s; el segundo todavía no

    limitador.consumir("ip")
    with pytest.raises(ErrorDatos):
        limitador.consumir("ip")


def test_un_intento_rechazado_no_cuenta():
    reloj = Reloj()
    limitador = LimitadorPorIp(maximo=1, ventana_s=60, reloj=reloj)
    limitador.consumir("ip")

    for _ in range(5):
        with pytest.raises(ErrorDatos):
            limitador.consumir("ip")
    reloj.segundos += 60

    limitador.consumir("ip")  # si los rechazos contaran, la ventana seguiría llena


def test_borra_las_ips_viejas_para_no_crecer_sin_limite(monkeypatch):
    monkeypatch.setattr("f1analytics.api.limites.LIMPIAR_TRAS_IPS", 5)
    reloj = Reloj()
    limitador = LimitadorPorIp(maximo=1, ventana_s=60, reloj=reloj)
    for i in range(10):
        limitador.consumir(f"ip{i}")
    reloj.segundos += 120

    limitador.consumir("otra")

    assert list(limitador._consumos) == ["otra"]


# --- LimitadorConcurrencia -----------------------------------------------------------


def test_nunca_corren_mas_analisis_a_la_vez_que_el_maximo():
    limitador = LimitadorConcurrencia(maximo=2)
    activos, maximo_visto = 0, 0
    cerrojo = threading.Lock()

    def analisis():
        nonlocal activos, maximo_visto
        with limitador.turno():
            with cerrojo:
                activos += 1
                maximo_visto = max(maximo_visto, activos)
            time.sleep(0.05)
            with cerrojo:
                activos -= 1

    hilos = [threading.Thread(target=analisis) for _ in range(8)]
    for hilo in hilos:
        hilo.start()
    for hilo in hilos:
        hilo.join()

    assert maximo_visto == 2


def test_el_turno_se_libera_aunque_el_analisis_falle():
    limitador = LimitadorConcurrencia(maximo=1)

    with pytest.raises(RuntimeError), limitador.turno():
        raise RuntimeError("falló")

    with limitador.turno():  # si no se hubiera liberado, esto se quedaría esperando
        pass


# --- ip_del_cliente ------------------------------------------------------------------


def test_la_ip_sale_de_x_forwarded_for_y_es_la_primera_de_la_lista():
    cabeceras = {"X-Forwarded-For": "203.0.113.7, 10.1.1.1, 10.2.2.2"}

    assert ip_del_cliente(peticion(cabeceras)) == "203.0.113.7"


def test_sin_x_forwarded_for_se_usa_la_ip_de_la_conexion():
    assert ip_del_cliente(peticion()) == "10.0.0.1"


def test_sin_ninguna_ip_no_falla():
    assert ip_del_cliente(peticion(cliente=None)) == "desconocida"
