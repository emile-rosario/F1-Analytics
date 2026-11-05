import numpy as np
import pandas as pd
import pytest
from conftest import CARRERA_ESPANA, PILOTOS_ESPANA

from f1analytics.datos.limpieza import (
    agregar_correccion_combustible,
    agregar_edad_goma,
    estado_pista_por_vuelta,
    limpiar_vueltas_carrera,
)

# --- estado_pista_por_vuelta ---------------------------------------------------------


def direccion(*eventos: tuple) -> pd.DataFrame:
    """Dirección de carrera de juguete. Evento: (vuelta, categoria, bandera, ambito, mensaje)."""
    filas = [
        {
            "fecha": pd.Timestamp("2024-06-23T13:00:00Z") + pd.Timedelta(seconds=i),
            "vuelta": vuelta,
            "categoria": categoria,
            "bandera": bandera,
            "ambito": ambito,
            "mensaje": mensaje,
        }
        for i, (vuelta, categoria, bandera, ambito, mensaje) in enumerate(eventos)
    ]
    return pd.DataFrame(
        filas, columns=["fecha", "vuelta", "categoria", "bandera", "ambito", "mensaje"]
    )


def sc(vuelta, mensaje):
    return (vuelta, "SafetyCar", None, None, mensaje)


def bandera(vuelta, nombre, ambito="Track"):
    return (vuelta, "Flag", nombre, ambito, f"{nombre} FLAG")


def sesion(vuelta, mensaje):
    return (vuelta, "SessionStatus", None, None, mensaje)


def tramos(estado: pd.Series) -> dict[str, list[int]]:
    return {e: list(estado[estado == e].index) for e in estado.unique()}


def test_sin_eventos_todas_las_vueltas_son_verdes():
    estado = estado_pista_por_vuelta(direccion(), 5)

    assert list(estado.index) == [1, 2, 3, 4, 5]
    assert set(estado) == {"verde"}
    assert estado.name == "estado_pista"


def test_el_safety_car_cubre_desde_que_sale_hasta_la_vuelta_en_que_entra():
    eventos = direccion(sc(5, "SAFETY CAR DEPLOYED"), sc(7, "SAFETY CAR IN THIS LAP"))

    estado = estado_pista_por_vuelta(eventos, 10)

    assert tramos(estado) == {"verde": [1, 2, 3, 4, 8, 9, 10], "sc": [5, 6, 7]}


def test_el_virtual_safety_car_cubre_hasta_que_termina():
    eventos = direccion(sc(10, "VIRTUAL SAFETY CAR DEPLOYED"), sc(11, "VIRTUAL SAFETY CAR ENDING"))

    estado = estado_pista_por_vuelta(eventos, 12)

    assert tramos(estado)["vsc"] == [10, 11]


def test_un_safety_car_que_sigue_al_acabar_la_carrera_dura_hasta_la_ultima_vuelta():
    estado = estado_pista_por_vuelta(direccion(sc(8, "SAFETY CAR DEPLOYED")), 10)

    assert tramos(estado)["sc"] == [8, 9, 10]


def test_bandera_roja_desde_que_sale_hasta_que_se_reanuda():
    eventos = direccion(
        sesion(1, "SESSION STARTED"),
        bandera(3, "RED"),
        sesion(3, "SESSION ABORTED"),
        sesion(4, "SESSION STARTED"),
    )

    estado = estado_pista_por_vuelta(eventos, 6)

    assert tramos(estado) == {"verde": [1, 2, 5, 6], "roja": [3, 4]}


def test_el_inicio_normal_de_la_carrera_no_es_una_bandera_roja():
    estado = estado_pista_por_vuelta(direccion(sesion(1, "SESSION STARTED")), 3)

    assert set(estado) == {"verde"}


def test_la_amarilla_de_toda_la_pista_cuenta_pero_la_de_un_sector_no():
    eventos = direccion(
        bandera(2, "YELLOW", ambito="Sector"),
        bandera(3, "DOUBLE YELLOW", ambito="Sector"),
        bandera(4, "YELLOW", ambito="Track"),
    )

    estado = estado_pista_por_vuelta(eventos, 5)

    assert tramos(estado) == {"verde": [1, 2, 3, 5], "amarilla": [4]}


def test_si_coinciden_varios_estados_manda_el_mas_serio():
    eventos = direccion(
        sc(5, "VIRTUAL SAFETY CAR DEPLOYED"),
        sc(5, "SAFETY CAR DEPLOYED"),
        sc(6, "SAFETY CAR IN THIS LAP"),
        bandera(6, "YELLOW"),
    )

    estado = estado_pista_por_vuelta(eventos, 8)

    assert estado[5] == "sc"
    assert estado[6] == "sc"
    assert estado[7] == "vsc"  # el VSC siguió abierto hasta el final de la carrera


def test_los_eventos_se_ordenan_por_fecha_aunque_lleguen_desordenados():
    eventos = direccion(sc(5, "SAFETY CAR DEPLOYED"), sc(7, "SAFETY CAR IN THIS LAP"))

    estado = estado_pista_por_vuelta(eventos.iloc[::-1], 10)

    assert tramos(estado)["sc"] == [5, 6, 7]


def test_los_eventos_fuera_de_la_carrera_se_recortan():
    eventos = direccion(sc(0, "SAFETY CAR DEPLOYED"), sc(99, "SAFETY CAR IN THIS LAP"))

    estado = estado_pista_por_vuelta(eventos, 4)

    assert set(estado) == {"sc"}
    assert len(estado) == 4


# --- limpiar_vueltas_carrera ---------------------------------------------------------


def vueltas_de(piloto: int, tiempos: list[float | None], salidas: tuple[int, ...] = ()):
    return pd.DataFrame(
        {
            "piloto": piloto,
            "vuelta": range(1, len(tiempos) + 1),
            "tiempo_vuelta_s": tiempos,
            "salida_pits": [v in salidas for v in range(1, len(tiempos) + 1)],
        }
    )


def sin_paradas() -> pd.DataFrame:
    return pd.DataFrame({"piloto": [], "vuelta": []}, dtype="int64")


def todas_verdes(n: int) -> pd.Series:
    return pd.Series("verde", index=pd.RangeIndex(1, n + 1, name="vuelta"))


def test_quita_la_primera_vuelta_y_las_que_no_tienen_tiempo():
    vueltas = vueltas_de(1, [95.0, 90.0, None, 90.5, 90.2])

    limpias = limpiar_vueltas_carrera(vueltas, sin_paradas(), todas_verdes(5))

    assert list(limpias["vuelta"]) == [2, 4, 5]


def test_quita_la_entrada_y_la_salida_de_boxes():
    vueltas = vueltas_de(1, [95.0, 90.0, 90.1, 99.0, 98.0, 90.2, 90.3], salidas=(5,))
    paradas = pd.DataFrame({"piloto": [1], "vuelta": [4]})

    limpias = limpiar_vueltas_carrera(vueltas, paradas, todas_verdes(7))

    assert list(limpias["vuelta"]) == [2, 3, 6, 7]


def test_la_parada_de_un_piloto_no_quita_la_vuelta_de_otro():
    vueltas = pd.concat(
        [vueltas_de(1, [95.0, 90.0, 90.1, 90.2]), vueltas_de(2, [95, 90, 90.1, 90.2])]
    )
    paradas = pd.DataFrame({"piloto": [1], "vuelta": [3]})

    limpias = limpiar_vueltas_carrera(vueltas, paradas, todas_verdes(4))

    assert sorted(zip(limpias["piloto"], limpias["vuelta"], strict=True)) == [
        (1, 2),
        (1, 4),
        (2, 2),
        (2, 3),
        (2, 4),
    ]


def test_quita_las_vueltas_que_no_son_verdes():
    vueltas = vueltas_de(1, [95.0, 90.0, 120.0, 121.0, 90.2, 90.3])
    estado = todas_verdes(6)
    estado[[3, 4]] = ["sc", "sc"]

    limpias = limpiar_vueltas_carrera(vueltas, sin_paradas(), estado)

    assert list(limpias["vuelta"]) == [2, 5, 6]
    assert set(limpias["estado_pista"]) == {"verde"}


def test_quita_las_vueltas_mucho_mas_lentas_que_la_mediana_del_piloto():
    vueltas = vueltas_de(1, [95.0, 90.0, 90.2, 100.0, 90.1, 90.3])  # la 4 es tráfico

    limpias = limpiar_vueltas_carrera(vueltas, sin_paradas(), todas_verdes(6))

    assert list(limpias["vuelta"]) == [2, 3, 5, 6]


def test_la_mediana_es_de_cada_piloto_y_no_de_todos():
    lento = vueltas_de(2, [105.0, 100.0, 100.2, 100.1, 100.3, 100.0])  # todo el ritmo es lento
    rapido = vueltas_de(1, [95.0, 90.0, 90.2, 90.1, 90.3, 90.0])

    limpias = limpiar_vueltas_carrera(pd.concat([rapido, lento]), sin_paradas(), todas_verdes(6))

    assert set(limpias["piloto"]) == {1, 2}
    assert len(limpias[limpias["piloto"] == 2]) == 5


def test_cada_filtro_se_puede_apagar():
    vueltas = vueltas_de(1, [95.0, 90.0, 100.0, 90.1], salidas=(3,))
    estado = todas_verdes(4)
    estado[2] = "sc"

    limpias = limpiar_vueltas_carrera(
        vueltas,
        pd.DataFrame({"piloto": [1], "vuelta": [2]}),
        estado,
        quitar_primera=False,
        solo_verde=False,
        quitar_pits=False,
        umbral_mediana=None,
    )

    assert list(limpias["vuelta"]) == [1, 2, 3, 4]


def test_no_modifica_la_tabla_original_y_agrega_el_estado_de_pista():
    vueltas = vueltas_de(1, [95.0, 90.0, 90.1])
    copia = vueltas.copy()

    limpias = limpiar_vueltas_carrera(vueltas, sin_paradas(), todas_verdes(3))

    pd.testing.assert_frame_equal(vueltas, copia)
    assert "estado_pista" in limpias.columns


def test_una_vuelta_fuera_del_estado_de_pista_se_toma_como_verde():
    vueltas = vueltas_de(1, [95.0, 90.0, 90.1])

    limpias = limpiar_vueltas_carrera(vueltas, sin_paradas(), todas_verdes(2))

    assert list(limpias["vuelta"]) == [2, 3]


def test_sin_vueltas_devuelve_una_tabla_vacia():
    vueltas = vueltas_de(1, [None, None])

    assert limpiar_vueltas_carrera(vueltas, sin_paradas(), todas_verdes(2)).empty


# --- agregar_edad_goma ---------------------------------------------------------------


def stints_de(*filas: tuple) -> pd.DataFrame:
    """Cada fila: (piloto, stint, compuesto, vuelta_inicio, vuelta_fin, edad_inicial)."""
    return pd.DataFrame(
        filas,
        columns=["piloto", "stint", "compuesto", "vuelta_inicio", "vuelta_fin", "edad_inicial"],
    )


def test_la_edad_de_la_goma_cuenta_desde_el_inicio_del_stint():
    vueltas = vueltas_de(1, [90.0] * 10)
    stints = stints_de((1, 1, "SOFT", 1, 5, 0), (1, 2, "HARD", 6, 10, 0))

    resultado = agregar_edad_goma(vueltas, stints)

    assert list(resultado["edad_goma"]) == [0, 1, 2, 3, 4, 0, 1, 2, 3, 4]
    assert list(resultado["compuesto"]) == ["SOFT"] * 5 + ["HARD"] * 5
    assert list(resultado["stint"]) == [1] * 5 + [2] * 5


def test_una_goma_usada_suma_su_edad_inicial():
    vueltas = vueltas_de(1, [90.0] * 4)
    stints = stints_de((1, 1, "SOFT", 1, 4, 3))

    resultado = agregar_edad_goma(vueltas, stints)

    assert list(resultado["edad_goma"]) == [3, 4, 5, 6]


def test_los_stints_de_otro_piloto_no_se_mezclan():
    vueltas = pd.concat([vueltas_de(1, [90.0] * 4), vueltas_de(2, [90.0] * 4)])
    stints = stints_de((1, 1, "SOFT", 1, 4, 0), (2, 1, "HARD", 1, 4, 7))

    resultado = agregar_edad_goma(vueltas, stints)

    assert list(resultado[resultado["piloto"] == 1]["compuesto"]) == ["SOFT"] * 4
    assert list(resultado[resultado["piloto"] == 2]["edad_goma"]) == [7, 8, 9, 10]


def test_una_vuelta_fuera_de_todo_stint_queda_sin_compuesto_ni_edad():
    vueltas = vueltas_de(1, [90.0] * 6)
    stints = stints_de((1, 1, "SOFT", 1, 4, 0))

    resultado = agregar_edad_goma(vueltas, stints)

    assert resultado["compuesto"].tolist()[:4] == ["SOFT"] * 4
    assert resultado["compuesto"].iloc[4:].isna().all()
    assert resultado["edad_goma"].iloc[4:].isna().all()


def test_un_stint_sin_vuelta_final_llega_hasta_el_final_de_la_carrera():
    vueltas = vueltas_de(1, [90.0] * 4)
    stints = stints_de((1, 1, "MEDIUM", 1, np.nan, np.nan))

    resultado = agregar_edad_goma(vueltas, stints)

    assert list(resultado["edad_goma"]) == [0, 1, 2, 3]


def test_sin_vueltas_agrega_las_columnas_igual():
    resultado = agregar_edad_goma(
        vueltas_de(1, [90.0]).iloc[0:0], stints_de((1, 1, "SOFT", 1, 5, 0))
    )

    assert resultado.empty
    assert {"stint", "compuesto", "edad_goma"} <= set(resultado.columns)


# --- agregar_correccion_combustible --------------------------------------------------


def test_la_correccion_deja_igual_la_primera_vuelta_y_suma_lo_que_se_ganó_por_peso():
    vueltas = vueltas_de(1, [90.0, 90.0, 90.0, 90.0])

    resultado = agregar_correccion_combustible(vueltas)

    assert list(resultado["tiempo_corregido_s"]) == pytest.approx([90.0, 90.06, 90.12, 90.18])


def test_la_correccion_acepta_otro_valor_y_no_toca_la_tabla_original():
    vueltas = vueltas_de(1, [90.0, 90.0, 90.0])

    resultado = agregar_correccion_combustible(vueltas, segundos_por_vuelta=0.1)

    assert list(resultado["tiempo_corregido_s"]) == pytest.approx([90.0, 90.1, 90.2])
    assert "tiempo_corregido_s" not in vueltas.columns


def test_corregir_cancela_el_efecto_del_combustible_en_una_goma_que_no_se_gasta():
    # Un coche cuya goma no se gasta, solo aligerado: gana 0,06 s por vuelta.
    tiempos = [90.0 - 0.06 * i for i in range(20)]
    vueltas = vueltas_de(1, tiempos)

    corregido = agregar_correccion_combustible(vueltas)["tiempo_corregido_s"]

    assert corregido.max() - corregido.min() == pytest.approx(0, abs=1e-9)


# --- con datos reales (España 2024) --------------------------------------------------


@pytest.fixture
def espana(cargador):
    vueltas = cargador.vueltas(CARRERA_ESPANA)
    n_vueltas = int(vueltas["vuelta"].max())
    estado = estado_pista_por_vuelta(cargador.direccion_carrera(CARRERA_ESPANA), n_vueltas)
    return cargador, vueltas, n_vueltas, estado


def test_espana_2024_se_corrio_toda_en_verde(espana):
    _, _, n_vueltas, estado = espana

    assert n_vueltas == 66
    assert set(estado) == {"verde"}


def test_en_espana_la_limpieza_deja_la_mayoria_de_las_vueltas_de_cada_piloto(espana):
    cargador, vueltas, _, estado = espana
    paradas = cargador.paradas(CARRERA_ESPANA)

    limpias = limpiar_vueltas_carrera(vueltas, paradas, estado)

    assert set(limpias["piloto"]) == set(PILOTOS_ESPANA)
    por_piloto = limpias.groupby("piloto").size()
    assert por_piloto.min() >= 50  # 66 vueltas, menos la 1, las de boxes y alguna lenta
    assert limpias["vuelta"].min() >= 2
    assert not limpias["salida_pits"].any()
    paradas_propias = {(p, v) for p, v in zip(paradas["piloto"], paradas["vuelta"], strict=True)}
    assert not any(
        (p, v) in paradas_propias for p, v in zip(limpias["piloto"], limpias["vuelta"], strict=True)
    )


def test_en_espana_la_edad_de_la_goma_sale_de_los_stints_reales(espana):
    cargador, vueltas, _, estado = espana
    limpias = limpiar_vueltas_carrera(vueltas, cargador.paradas(CARRERA_ESPANA), estado)

    con_edad = agregar_edad_goma(limpias, cargador.stints(CARRERA_ESPANA))

    assert con_edad["compuesto"].notna().all()
    assert set(con_edad["compuesto"]) <= {"SOFT", "MEDIUM", "HARD"}
    assert {"SOFT", "MEDIUM"} <= set(con_edad["compuesto"])
    assert (con_edad["edad_goma"] >= 0).all()
    # Verstappen salió con unas blandas que ya traían 3 vueltas: en la vuelta 2 tienen 4.
    verstappen = con_edad[(con_edad["piloto"] == 1) & (con_edad["vuelta"] == 2)].iloc[0]
    assert (verstappen["compuesto"], verstappen["edad_goma"]) == ("SOFT", 4)
