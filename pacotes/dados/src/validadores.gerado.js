// Gerado por pacotes/dados/scripts/gerar-validadores.ts a partir de dados/schema/*.schema.json. Não editar à mão.
/* eslint-disable */
import func2_modulo from "ajv/dist/runtime/ucs2length.js";
import func0_modulo from "ajv/dist/runtime/equal.js";
("use strict");
export const validarLocal = validate20;
const schema31 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://missasemguimaraes.pt/schema/local.schema.json",
  title: "Local de culto (igreja, capela, santuário…)",
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "tipo",
    "entidade",
    "nome",
    "geo",
    "publicar",
    "dias_santos",
    "horarios",
    "excecoes",
    "confirmado_em",
    "revisao",
    "concelho",
  ],
  properties: {
    id: { $ref: "#/$defs/id" },
    tipo: { enum: ["igreja", "capela", "santuario", "mosteiro", "lar", "hospital", "outro"] },
    entidade: {
      $ref: "#/$defs/id",
      description: "Entidade responsável (paróquia, irmandade, santuário…)",
    },
    concelho: { enum: ["Guimarães", "Vizela"] },
    nome: { type: "string", minLength: 3 },
    orago: { type: ["string", "null"] },
    localidade: { type: ["string", "null"] },
    freguesia: { type: ["string", "null"] },
    morada: { type: ["string", "null"] },
    codigo_postal: { type: ["string", "null"], pattern: "^\\d{4}(-\\d{3})?$" },
    geo: {
      type: "object",
      additionalProperties: false,
      required: ["lat", "lon"],
      properties: {
        lat: { type: "number", minimum: 41.3, maximum: 41.62 },
        lon: { type: "number", minimum: -8.5, maximum: -8.15 },
      },
    },
    publicar: { type: "boolean" },
    dias_santos: {
      enum: ["horario_domingo", "horario_proprio", "horario_habitual", null],
      description:
        "Como o local celebra os dias santos de preceito (dados/calendario.yml). horario_domingo: aplicam-se as regras de domingo; horario_proprio: aplicam-se as regras com dias: [santo]; horario_habitual: mantém o horário do dia da semana; null: desconhecido.",
    },
    acessibilidade: { type: ["string", "null"] },
    horarios: { type: "array", items: { $ref: "#/$defs/regra" } },
    excecoes: { type: "array", items: { $ref: "#/$defs/excecao" } },
    notas: { type: "array", items: { type: "string" } },
    notas_i18n: {
      type: "object",
      additionalProperties: false,
      properties: {
        en: { type: "array", items: { type: "string" } },
        es: { type: "array", items: { type: "string" } },
      },
    },
    confirmado_em: {
      oneOf: [{ $ref: "#/$defs/data" }, { type: "null" }],
      description:
        "Última confirmação pela entidade (AAAA-MM-DD); a validade da data é verificada pelo motor.",
    },
    confirmado_por: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        canal: { enum: ["painel", "email", "secretaria", "moderacao"] },
        ref: { type: "string" },
      },
    },
    revisao: {
      type: "object",
      additionalProperties: false,
      required: ["pendente", "motivos"],
      properties: {
        pendente: { type: "boolean" },
        motivos: { type: "array", items: { type: "string" } },
      },
    },
  },
  $defs: {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    hora: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    dia: { enum: ["seg", "ter", "qua", "qui", "sex", "sab", "dom", "santo"] },
    tipo_celebracao: { enum: ["missa", "confissoes", "adoracao", "terco", "outro"] },
    regra: {
      type: "object",
      additionalProperties: false,
      required: ["tipo", "dias", "hora"],
      properties: {
        tipo: { $ref: "#/$defs/tipo_celebracao" },
        dias: { type: "array", minItems: 1, uniqueItems: true, items: { $ref: "#/$defs/dia" } },
        hora: { $ref: "#/$defs/hora" },
        hora_fim: { $ref: "#/$defs/hora" },
        epoca: { enum: ["verao", "inverno"] },
        semanas_do_mes: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { enum: [1, 2, 3, 4, 5, -1] },
        },
        meses: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "integer", minimum: 1, maximum: 12 },
        },
        quinzenal: {
          type: "object",
          additionalProperties: false,
          required: ["referencia"],
          properties: { referencia: { oneOf: [{ $ref: "#/$defs/data" }, { type: "null" }] } },
        },
        validade: {
          type: "object",
          additionalProperties: false,
          properties: { de: { $ref: "#/$defs/data" }, ate: { $ref: "#/$defs/data" } },
        },
        idioma: { type: "string", default: "pt" },
        nota: { type: "string" },
        nota_i18n: {
          type: "object",
          properties: { en: { type: "string" }, es: { type: "string" } },
        },
      },
    },
    excecao: {
      type: "object",
      additionalProperties: false,
      required: ["data", "acao"],
      properties: {
        data: { $ref: "#/$defs/data" },
        acao: { enum: ["cancelar", "adicionar", "alterar"] },
        tipo: { $ref: "#/$defs/tipo_celebracao" },
        hora: { $ref: "#/$defs/hora" },
        hora_original: { $ref: "#/$defs/hora" },
        nota: { type: "string" },
      },
    },
  },
};
const schema32 = { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" };
const schema39 = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const func1 = Object.prototype.hasOwnProperty;
const func2 = func2_modulo.default ?? func2_modulo;
const pattern4 = new RegExp("^[a-z0-9]+(-[a-z0-9]+)*$", "u");
const pattern6 = new RegExp("^\\d{4}(-\\d{3})?$", "u");
const pattern9 = new RegExp("^\\d{4}-\\d{2}-\\d{2}$", "u");
const schema34 = {
  type: "object",
  additionalProperties: false,
  required: ["tipo", "dias", "hora"],
  properties: {
    tipo: { $ref: "#/$defs/tipo_celebracao" },
    dias: { type: "array", minItems: 1, uniqueItems: true, items: { $ref: "#/$defs/dia" } },
    hora: { $ref: "#/$defs/hora" },
    hora_fim: { $ref: "#/$defs/hora" },
    epoca: { enum: ["verao", "inverno"] },
    semanas_do_mes: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { enum: [1, 2, 3, 4, 5, -1] },
    },
    meses: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "integer", minimum: 1, maximum: 12 },
    },
    quinzenal: {
      type: "object",
      additionalProperties: false,
      required: ["referencia"],
      properties: { referencia: { oneOf: [{ $ref: "#/$defs/data" }, { type: "null" }] } },
    },
    validade: {
      type: "object",
      additionalProperties: false,
      properties: { de: { $ref: "#/$defs/data" }, ate: { $ref: "#/$defs/data" } },
    },
    idioma: { type: "string", default: "pt" },
    nota: { type: "string" },
    nota_i18n: { type: "object", properties: { en: { type: "string" }, es: { type: "string" } } },
  },
};
const schema35 = { enum: ["missa", "confissoes", "adoracao", "terco", "outro"] };
const schema36 = { enum: ["seg", "ter", "qua", "qui", "sex", "sab", "dom", "santo"] };
const schema37 = { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" };
const func0 = func0_modulo.default ?? func0_modulo;
const pattern7 = new RegExp("^([01]\\d|2[0-3]):[0-5]\\d$", "u");

function validate21(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.tipo === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tipo" },
        message: "must have required property '" + "tipo" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.dias === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "dias" },
        message: "must have required property '" + "dias" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.hora === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "hora" },
        message: "must have required property '" + "hora" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema34.properties, key0)) {
        const err3 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.tipo !== undefined) {
      let data0 = data.tipo;
      if (!(
        data0 === "missa" ||
        data0 === "confissoes" ||
        data0 === "adoracao" ||
        data0 === "terco" ||
        data0 === "outro"
      )) {
        const err4 = {
          instancePath: instancePath + "/tipo",
          schemaPath: "#/$defs/tipo_celebracao/enum",
          keyword: "enum",
          params: { allowedValues: schema35.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.dias !== undefined) {
      let data1 = data.dias;
      if (Array.isArray(data1)) {
        if (data1.length < 1) {
          const err5 = {
            instancePath: instancePath + "/dias",
            schemaPath: "#/properties/dias/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data2 = data1[i0];
          if (!(
            data2 === "seg" ||
            data2 === "ter" ||
            data2 === "qua" ||
            data2 === "qui" ||
            data2 === "sex" ||
            data2 === "sab" ||
            data2 === "dom" ||
            data2 === "santo"
          )) {
            const err6 = {
              instancePath: instancePath + "/dias/" + i0,
              schemaPath: "#/$defs/dia/enum",
              keyword: "enum",
              params: { allowedValues: schema36.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        let i1 = data1.length;
        let j0;
        if (i1 > 1) {
          outer0: for (; i1--;) {
            for (j0 = i1; j0--;) {
              if (func0(data1[i1], data1[j0])) {
                const err7 = {
                  instancePath: instancePath + "/dias",
                  schemaPath: "#/properties/dias/uniqueItems",
                  keyword: "uniqueItems",
                  params: { i: i1, j: j0 },
                  message:
                    "must NOT have duplicate items (items ## " +
                    j0 +
                    " and " +
                    i1 +
                    " are identical)",
                };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
                break outer0;
              }
            }
          }
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/dias",
          schemaPath: "#/properties/dias/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.hora !== undefined) {
      let data3 = data.hora;
      if (typeof data3 === "string") {
        if (!pattern7.test(data3)) {
          const err9 = {
            instancePath: instancePath + "/hora",
            schemaPath: "#/$defs/hora/pattern",
            keyword: "pattern",
            params: { pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            message: 'must match pattern "' + "^([01]\\d|2[0-3]):[0-5]\\d$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/hora",
          schemaPath: "#/$defs/hora/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.hora_fim !== undefined) {
      let data4 = data.hora_fim;
      if (typeof data4 === "string") {
        if (!pattern7.test(data4)) {
          const err11 = {
            instancePath: instancePath + "/hora_fim",
            schemaPath: "#/$defs/hora/pattern",
            keyword: "pattern",
            params: { pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            message: 'must match pattern "' + "^([01]\\d|2[0-3]):[0-5]\\d$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = {
          instancePath: instancePath + "/hora_fim",
          schemaPath: "#/$defs/hora/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.epoca !== undefined) {
      let data5 = data.epoca;
      if (!(data5 === "verao" || data5 === "inverno")) {
        const err13 = {
          instancePath: instancePath + "/epoca",
          schemaPath: "#/properties/epoca/enum",
          keyword: "enum",
          params: { allowedValues: schema34.properties.epoca.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.semanas_do_mes !== undefined) {
      let data6 = data.semanas_do_mes;
      if (Array.isArray(data6)) {
        if (data6.length < 1) {
          const err14 = {
            instancePath: instancePath + "/semanas_do_mes",
            schemaPath: "#/properties/semanas_do_mes/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        const len1 = data6.length;
        for (let i2 = 0; i2 < len1; i2++) {
          let data7 = data6[i2];
          if (!(
            data7 === 1 ||
            data7 === 2 ||
            data7 === 3 ||
            data7 === 4 ||
            data7 === 5 ||
            data7 === -1
          )) {
            const err15 = {
              instancePath: instancePath + "/semanas_do_mes/" + i2,
              schemaPath: "#/properties/semanas_do_mes/items/enum",
              keyword: "enum",
              params: { allowedValues: schema34.properties.semanas_do_mes.items.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        let i3 = data6.length;
        let j1;
        if (i3 > 1) {
          outer1: for (; i3--;) {
            for (j1 = i3; j1--;) {
              if (func0(data6[i3], data6[j1])) {
                const err16 = {
                  instancePath: instancePath + "/semanas_do_mes",
                  schemaPath: "#/properties/semanas_do_mes/uniqueItems",
                  keyword: "uniqueItems",
                  params: { i: i3, j: j1 },
                  message:
                    "must NOT have duplicate items (items ## " +
                    j1 +
                    " and " +
                    i3 +
                    " are identical)",
                };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
                break outer1;
              }
            }
          }
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/semanas_do_mes",
          schemaPath: "#/properties/semanas_do_mes/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.meses !== undefined) {
      let data8 = data.meses;
      if (Array.isArray(data8)) {
        if (data8.length < 1) {
          const err18 = {
            instancePath: instancePath + "/meses",
            schemaPath: "#/properties/meses/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        const len2 = data8.length;
        for (let i4 = 0; i4 < len2; i4++) {
          let data9 = data8[i4];
          if (!(typeof data9 == "number" && !(data9 % 1) && !isNaN(data9))) {
            const err19 = {
              instancePath: instancePath + "/meses/" + i4,
              schemaPath: "#/properties/meses/items/type",
              keyword: "type",
              params: { type: "integer" },
              message: "must be integer",
            };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (typeof data9 == "number") {
            if (data9 > 12 || isNaN(data9)) {
              const err20 = {
                instancePath: instancePath + "/meses/" + i4,
                schemaPath: "#/properties/meses/items/maximum",
                keyword: "maximum",
                params: { comparison: "<=", limit: 12 },
                message: "must be <= 12",
              };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data9 < 1 || isNaN(data9)) {
              const err21 = {
                instancePath: instancePath + "/meses/" + i4,
                schemaPath: "#/properties/meses/items/minimum",
                keyword: "minimum",
                params: { comparison: ">=", limit: 1 },
                message: "must be >= 1",
              };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
        let i5 = data8.length;
        let j2;
        if (i5 > 1) {
          const indices0 = {};
          for (; i5--;) {
            let item0 = data8[i5];
            if (!(typeof item0 == "number" && !(item0 % 1) && !isNaN(item0))) {
              continue;
            }
            if (typeof indices0[item0] == "number") {
              j2 = indices0[item0];
              const err22 = {
                instancePath: instancePath + "/meses",
                schemaPath: "#/properties/meses/uniqueItems",
                keyword: "uniqueItems",
                params: { i: i5, j: j2 },
                message:
                  "must NOT have duplicate items (items ## " +
                  j2 +
                  " and " +
                  i5 +
                  " are identical)",
              };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
              break;
            }
            indices0[item0] = i5;
          }
        }
      } else {
        const err23 = {
          instancePath: instancePath + "/meses",
          schemaPath: "#/properties/meses/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.quinzenal !== undefined) {
      let data10 = data.quinzenal;
      if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
        if (data10.referencia === undefined) {
          const err24 = {
            instancePath: instancePath + "/quinzenal",
            schemaPath: "#/properties/quinzenal/required",
            keyword: "required",
            params: { missingProperty: "referencia" },
            message: "must have required property '" + "referencia" + "'",
          };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        for (const key1 in data10) {
          if (!(key1 === "referencia")) {
            const err25 = {
              instancePath: instancePath + "/quinzenal",
              schemaPath: "#/properties/quinzenal/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key1 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data10.referencia !== undefined) {
          let data11 = data10.referencia;
          const _errs26 = errors;
          let valid15 = false;
          let passing0 = null;
          const _errs27 = errors;
          if (typeof data11 === "string") {
            if (!pattern9.test(data11)) {
              const err26 = {
                instancePath: instancePath + "/quinzenal/referencia",
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          } else {
            const err27 = {
              instancePath: instancePath + "/quinzenal/referencia",
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
          var _valid0 = _errs27 === errors;
          if (_valid0) {
            valid15 = true;
            passing0 = 0;
          }
          const _errs30 = errors;
          if (data11 !== null) {
            const err28 = {
              instancePath: instancePath + "/quinzenal/referencia",
              schemaPath: "#/properties/quinzenal/properties/referencia/oneOf/1/type",
              keyword: "type",
              params: { type: "null" },
              message: "must be null",
            };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          var _valid0 = _errs30 === errors;
          if (_valid0 && valid15) {
            valid15 = false;
            passing0 = [passing0, 1];
          } else {
            if (_valid0) {
              valid15 = true;
              passing0 = 1;
            }
          }
          if (!valid15) {
            const err29 = {
              instancePath: instancePath + "/quinzenal/referencia",
              schemaPath: "#/properties/quinzenal/properties/referencia/oneOf",
              keyword: "oneOf",
              params: { passingSchemas: passing0 },
              message: "must match exactly one schema in oneOf",
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          } else {
            errors = _errs26;
            if (vErrors !== null) {
              if (_errs26) {
                vErrors.length = _errs26;
              } else {
                vErrors = null;
              }
            }
          }
        }
      } else {
        const err30 = {
          instancePath: instancePath + "/quinzenal",
          schemaPath: "#/properties/quinzenal/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.validade !== undefined) {
      let data12 = data.validade;
      if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
        for (const key2 in data12) {
          if (!(key2 === "de" || key2 === "ate")) {
            const err31 = {
              instancePath: instancePath + "/validade",
              schemaPath: "#/properties/validade/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key2 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data12.de !== undefined) {
          let data13 = data12.de;
          if (typeof data13 === "string") {
            if (!pattern9.test(data13)) {
              const err32 = {
                instancePath: instancePath + "/validade/de",
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          } else {
            const err33 = {
              instancePath: instancePath + "/validade/de",
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data12.ate !== undefined) {
          let data14 = data12.ate;
          if (typeof data14 === "string") {
            if (!pattern9.test(data14)) {
              const err34 = {
                instancePath: instancePath + "/validade/ate",
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          } else {
            const err35 = {
              instancePath: instancePath + "/validade/ate",
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
      } else {
        const err36 = {
          instancePath: instancePath + "/validade",
          schemaPath: "#/properties/validade/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.idioma !== undefined) {
      if (typeof data.idioma !== "string") {
        const err37 = {
          instancePath: instancePath + "/idioma",
          schemaPath: "#/properties/idioma/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
    if (data.nota !== undefined) {
      if (typeof data.nota !== "string") {
        const err38 = {
          instancePath: instancePath + "/nota",
          schemaPath: "#/properties/nota/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err38];
        } else {
          vErrors.push(err38);
        }
        errors++;
      }
    }
    if (data.nota_i18n !== undefined) {
      let data17 = data.nota_i18n;
      if (data17 && typeof data17 == "object" && !Array.isArray(data17)) {
        if (data17.en !== undefined) {
          if (typeof data17.en !== "string") {
            const err39 = {
              instancePath: instancePath + "/nota_i18n/en",
              schemaPath: "#/properties/nota_i18n/properties/en/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        if (data17.es !== undefined) {
          if (typeof data17.es !== "string") {
            const err40 = {
              instancePath: instancePath + "/nota_i18n/es",
              schemaPath: "#/properties/nota_i18n/properties/es/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
        }
      } else {
        const err41 = {
          instancePath: instancePath + "/nota_i18n",
          schemaPath: "#/properties/nota_i18n/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
    }
  } else {
    const err42 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err42];
    } else {
      vErrors.push(err42);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

const schema42 = {
  type: "object",
  additionalProperties: false,
  required: ["data", "acao"],
  properties: {
    data: { $ref: "#/$defs/data" },
    acao: { enum: ["cancelar", "adicionar", "alterar"] },
    tipo: { $ref: "#/$defs/tipo_celebracao" },
    hora: { $ref: "#/$defs/hora" },
    hora_original: { $ref: "#/$defs/hora" },
    nota: { type: "string" },
  },
};

function validate23(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate23.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.data === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "data" },
        message: "must have required property '" + "data" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.acao === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "acao" },
        message: "must have required property '" + "acao" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === "data" ||
        key0 === "acao" ||
        key0 === "tipo" ||
        key0 === "hora" ||
        key0 === "hora_original" ||
        key0 === "nota"
      )) {
        const err2 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.data !== undefined) {
      let data0 = data.data;
      if (typeof data0 === "string") {
        if (!pattern9.test(data0)) {
          const err3 = {
            instancePath: instancePath + "/data",
            schemaPath: "#/$defs/data/pattern",
            keyword: "pattern",
            params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + "/data",
          schemaPath: "#/$defs/data/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.acao !== undefined) {
      let data1 = data.acao;
      if (!(data1 === "cancelar" || data1 === "adicionar" || data1 === "alterar")) {
        const err5 = {
          instancePath: instancePath + "/acao",
          schemaPath: "#/properties/acao/enum",
          keyword: "enum",
          params: { allowedValues: schema42.properties.acao.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.tipo !== undefined) {
      let data2 = data.tipo;
      if (!(
        data2 === "missa" ||
        data2 === "confissoes" ||
        data2 === "adoracao" ||
        data2 === "terco" ||
        data2 === "outro"
      )) {
        const err6 = {
          instancePath: instancePath + "/tipo",
          schemaPath: "#/$defs/tipo_celebracao/enum",
          keyword: "enum",
          params: { allowedValues: schema35.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.hora !== undefined) {
      let data3 = data.hora;
      if (typeof data3 === "string") {
        if (!pattern7.test(data3)) {
          const err7 = {
            instancePath: instancePath + "/hora",
            schemaPath: "#/$defs/hora/pattern",
            keyword: "pattern",
            params: { pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            message: 'must match pattern "' + "^([01]\\d|2[0-3]):[0-5]\\d$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = {
          instancePath: instancePath + "/hora",
          schemaPath: "#/$defs/hora/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.hora_original !== undefined) {
      let data4 = data.hora_original;
      if (typeof data4 === "string") {
        if (!pattern7.test(data4)) {
          const err9 = {
            instancePath: instancePath + "/hora_original",
            schemaPath: "#/$defs/hora/pattern",
            keyword: "pattern",
            params: { pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
            message: 'must match pattern "' + "^([01]\\d|2[0-3]):[0-5]\\d$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = {
          instancePath: instancePath + "/hora_original",
          schemaPath: "#/$defs/hora/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.nota !== undefined) {
      if (typeof data.nota !== "string") {
        const err11 = {
          instancePath: instancePath + "/nota",
          schemaPath: "#/properties/nota/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
  } else {
    const err12 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err12];
    } else {
      vErrors.push(err12);
    }
    errors++;
  }
  validate23.errors = vErrors;
  return errors === 0;
}
validate23.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

function validate20(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  /*# sourceURL="https://missasemguimaraes.pt/schema/local.schema.json" */ let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.tipo === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tipo" },
        message: "must have required property '" + "tipo" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.entidade === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "entidade" },
        message: "must have required property '" + "entidade" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.nome === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "nome" },
        message: "must have required property '" + "nome" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.geo === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "geo" },
        message: "must have required property '" + "geo" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.publicar === undefined) {
      const err5 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "publicar" },
        message: "must have required property '" + "publicar" + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.dias_santos === undefined) {
      const err6 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "dias_santos" },
        message: "must have required property '" + "dias_santos" + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.horarios === undefined) {
      const err7 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "horarios" },
        message: "must have required property '" + "horarios" + "'",
      };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.excecoes === undefined) {
      const err8 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "excecoes" },
        message: "must have required property '" + "excecoes" + "'",
      };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.confirmado_em === undefined) {
      const err9 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "confirmado_em" },
        message: "must have required property '" + "confirmado_em" + "'",
      };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.revisao === undefined) {
      const err10 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "revisao" },
        message: "must have required property '" + "revisao" + "'",
      };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.concelho === undefined) {
      const err11 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "concelho" },
        message: "must have required property '" + "concelho" + "'",
      };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema31.properties, key0)) {
        const err12 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err13 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
            message: 'must match pattern "' + "^[a-z0-9]+(-[a-z0-9]+)*$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/id/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.tipo !== undefined) {
      let data1 = data.tipo;
      if (!(
        data1 === "igreja" ||
        data1 === "capela" ||
        data1 === "santuario" ||
        data1 === "mosteiro" ||
        data1 === "lar" ||
        data1 === "hospital" ||
        data1 === "outro"
      )) {
        const err15 = {
          instancePath: instancePath + "/tipo",
          schemaPath: "#/properties/tipo/enum",
          keyword: "enum",
          params: { allowedValues: schema31.properties.tipo.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.entidade !== undefined) {
      let data2 = data.entidade;
      if (typeof data2 === "string") {
        if (!pattern4.test(data2)) {
          const err16 = {
            instancePath: instancePath + "/entidade",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
            message: 'must match pattern "' + "^[a-z0-9]+(-[a-z0-9]+)*$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/entidade",
          schemaPath: "#/$defs/id/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.concelho !== undefined) {
      let data3 = data.concelho;
      if (!(data3 === "Guimarães" || data3 === "Vizela")) {
        const err18 = {
          instancePath: instancePath + "/concelho",
          schemaPath: "#/properties/concelho/enum",
          keyword: "enum",
          params: { allowedValues: schema31.properties.concelho.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.nome !== undefined) {
      let data4 = data.nome;
      if (typeof data4 === "string") {
        if (func2(data4) < 3) {
          const err19 = {
            instancePath: instancePath + "/nome",
            schemaPath: "#/properties/nome/minLength",
            keyword: "minLength",
            params: { limit: 3 },
            message: "must NOT have fewer than 3 characters",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = {
          instancePath: instancePath + "/nome",
          schemaPath: "#/properties/nome/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.orago !== undefined) {
      let data5 = data.orago;
      if (typeof data5 !== "string" && data5 !== null) {
        const err21 = {
          instancePath: instancePath + "/orago",
          schemaPath: "#/properties/orago/type",
          keyword: "type",
          params: { type: schema31.properties.orago.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.localidade !== undefined) {
      let data6 = data.localidade;
      if (typeof data6 !== "string" && data6 !== null) {
        const err22 = {
          instancePath: instancePath + "/localidade",
          schemaPath: "#/properties/localidade/type",
          keyword: "type",
          params: { type: schema31.properties.localidade.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.freguesia !== undefined) {
      let data7 = data.freguesia;
      if (typeof data7 !== "string" && data7 !== null) {
        const err23 = {
          instancePath: instancePath + "/freguesia",
          schemaPath: "#/properties/freguesia/type",
          keyword: "type",
          params: { type: schema31.properties.freguesia.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.morada !== undefined) {
      let data8 = data.morada;
      if (typeof data8 !== "string" && data8 !== null) {
        const err24 = {
          instancePath: instancePath + "/morada",
          schemaPath: "#/properties/morada/type",
          keyword: "type",
          params: { type: schema31.properties.morada.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.codigo_postal !== undefined) {
      let data9 = data.codigo_postal;
      if (typeof data9 !== "string" && data9 !== null) {
        const err25 = {
          instancePath: instancePath + "/codigo_postal",
          schemaPath: "#/properties/codigo_postal/type",
          keyword: "type",
          params: { type: schema31.properties.codigo_postal.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      if (typeof data9 === "string") {
        if (!pattern6.test(data9)) {
          const err26 = {
            instancePath: instancePath + "/codigo_postal",
            schemaPath: "#/properties/codigo_postal/pattern",
            keyword: "pattern",
            params: { pattern: "^\\d{4}(-\\d{3})?$" },
            message: 'must match pattern "' + "^\\d{4}(-\\d{3})?$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
    }
    if (data.geo !== undefined) {
      let data10 = data.geo;
      if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
        if (data10.lat === undefined) {
          const err27 = {
            instancePath: instancePath + "/geo",
            schemaPath: "#/properties/geo/required",
            keyword: "required",
            params: { missingProperty: "lat" },
            message: "must have required property '" + "lat" + "'",
          };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (data10.lon === undefined) {
          const err28 = {
            instancePath: instancePath + "/geo",
            schemaPath: "#/properties/geo/required",
            keyword: "required",
            params: { missingProperty: "lon" },
            message: "must have required property '" + "lon" + "'",
          };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        for (const key1 in data10) {
          if (!(key1 === "lat" || key1 === "lon")) {
            const err29 = {
              instancePath: instancePath + "/geo",
              schemaPath: "#/properties/geo/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key1 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data10.lat !== undefined) {
          let data11 = data10.lat;
          if (typeof data11 == "number") {
            if (data11 > 41.62 || isNaN(data11)) {
              const err30 = {
                instancePath: instancePath + "/geo/lat",
                schemaPath: "#/properties/geo/properties/lat/maximum",
                keyword: "maximum",
                params: { comparison: "<=", limit: 41.62 },
                message: "must be <= 41.62",
              };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            if (data11 < 41.3 || isNaN(data11)) {
              const err31 = {
                instancePath: instancePath + "/geo/lat",
                schemaPath: "#/properties/geo/properties/lat/minimum",
                keyword: "minimum",
                params: { comparison: ">=", limit: 41.3 },
                message: "must be >= 41.3",
              };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          } else {
            const err32 = {
              instancePath: instancePath + "/geo/lat",
              schemaPath: "#/properties/geo/properties/lat/type",
              keyword: "type",
              params: { type: "number" },
              message: "must be number",
            };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data10.lon !== undefined) {
          let data12 = data10.lon;
          if (typeof data12 == "number") {
            if (data12 > -8.15 || isNaN(data12)) {
              const err33 = {
                instancePath: instancePath + "/geo/lon",
                schemaPath: "#/properties/geo/properties/lon/maximum",
                keyword: "maximum",
                params: { comparison: "<=", limit: -8.15 },
                message: "must be <= -8.15",
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data12 < -8.5 || isNaN(data12)) {
              const err34 = {
                instancePath: instancePath + "/geo/lon",
                schemaPath: "#/properties/geo/properties/lon/minimum",
                keyword: "minimum",
                params: { comparison: ">=", limit: -8.5 },
                message: "must be >= -8.5",
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          } else {
            const err35 = {
              instancePath: instancePath + "/geo/lon",
              schemaPath: "#/properties/geo/properties/lon/type",
              keyword: "type",
              params: { type: "number" },
              message: "must be number",
            };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
      } else {
        const err36 = {
          instancePath: instancePath + "/geo",
          schemaPath: "#/properties/geo/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.publicar !== undefined) {
      if (typeof data.publicar !== "boolean") {
        const err37 = {
          instancePath: instancePath + "/publicar",
          schemaPath: "#/properties/publicar/type",
          keyword: "type",
          params: { type: "boolean" },
          message: "must be boolean",
        };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
    if (data.dias_santos !== undefined) {
      let data14 = data.dias_santos;
      if (!(
        data14 === "horario_domingo" ||
        data14 === "horario_proprio" ||
        data14 === "horario_habitual" ||
        data14 === null
      )) {
        const err38 = {
          instancePath: instancePath + "/dias_santos",
          schemaPath: "#/properties/dias_santos/enum",
          keyword: "enum",
          params: { allowedValues: schema31.properties.dias_santos.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err38];
        } else {
          vErrors.push(err38);
        }
        errors++;
      }
    }
    if (data.acessibilidade !== undefined) {
      let data15 = data.acessibilidade;
      if (typeof data15 !== "string" && data15 !== null) {
        const err39 = {
          instancePath: instancePath + "/acessibilidade",
          schemaPath: "#/properties/acessibilidade/type",
          keyword: "type",
          params: { type: schema31.properties.acessibilidade.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
    }
    if (data.horarios !== undefined) {
      let data16 = data.horarios;
      if (Array.isArray(data16)) {
        const len0 = data16.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate21(data16[i0], {
              instancePath: instancePath + "/horarios/" + i0,
              parentData: data16,
              parentDataProperty: i0,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err40 = {
          instancePath: instancePath + "/horarios",
          schemaPath: "#/properties/horarios/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    if (data.excecoes !== undefined) {
      let data18 = data.excecoes;
      if (Array.isArray(data18)) {
        const len1 = data18.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (
            !validate23(data18[i1], {
              instancePath: instancePath + "/excecoes/" + i1,
              parentData: data18,
              parentDataProperty: i1,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err41 = {
          instancePath: instancePath + "/excecoes",
          schemaPath: "#/properties/excecoes/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
    }
    if (data.notas !== undefined) {
      let data20 = data.notas;
      if (Array.isArray(data20)) {
        const len2 = data20.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (typeof data20[i2] !== "string") {
            const err42 = {
              instancePath: instancePath + "/notas/" + i2,
              schemaPath: "#/properties/notas/items/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
      } else {
        const err43 = {
          instancePath: instancePath + "/notas",
          schemaPath: "#/properties/notas/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err43];
        } else {
          vErrors.push(err43);
        }
        errors++;
      }
    }
    if (data.notas_i18n !== undefined) {
      let data22 = data.notas_i18n;
      if (data22 && typeof data22 == "object" && !Array.isArray(data22)) {
        for (const key2 in data22) {
          if (!(key2 === "en" || key2 === "es")) {
            const err44 = {
              instancePath: instancePath + "/notas_i18n",
              schemaPath: "#/properties/notas_i18n/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key2 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data22.en !== undefined) {
          let data23 = data22.en;
          if (Array.isArray(data23)) {
            const len3 = data23.length;
            for (let i3 = 0; i3 < len3; i3++) {
              if (typeof data23[i3] !== "string") {
                const err45 = {
                  instancePath: instancePath + "/notas_i18n/en/" + i3,
                  schemaPath: "#/properties/notas_i18n/properties/en/items/type",
                  keyword: "type",
                  params: { type: "string" },
                  message: "must be string",
                };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
          } else {
            const err46 = {
              instancePath: instancePath + "/notas_i18n/en",
              schemaPath: "#/properties/notas_i18n/properties/en/type",
              keyword: "type",
              params: { type: "array" },
              message: "must be array",
            };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
        if (data22.es !== undefined) {
          let data25 = data22.es;
          if (Array.isArray(data25)) {
            const len4 = data25.length;
            for (let i4 = 0; i4 < len4; i4++) {
              if (typeof data25[i4] !== "string") {
                const err47 = {
                  instancePath: instancePath + "/notas_i18n/es/" + i4,
                  schemaPath: "#/properties/notas_i18n/properties/es/items/type",
                  keyword: "type",
                  params: { type: "string" },
                  message: "must be string",
                };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
          } else {
            const err48 = {
              instancePath: instancePath + "/notas_i18n/es",
              schemaPath: "#/properties/notas_i18n/properties/es/type",
              keyword: "type",
              params: { type: "array" },
              message: "must be array",
            };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
      } else {
        const err49 = {
          instancePath: instancePath + "/notas_i18n",
          schemaPath: "#/properties/notas_i18n/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err49];
        } else {
          vErrors.push(err49);
        }
        errors++;
      }
    }
    if (data.confirmado_em !== undefined) {
      let data27 = data.confirmado_em;
      const _errs56 = errors;
      let valid15 = false;
      let passing0 = null;
      const _errs57 = errors;
      if (typeof data27 === "string") {
        if (!pattern9.test(data27)) {
          const err50 = {
            instancePath: instancePath + "/confirmado_em",
            schemaPath: "#/$defs/data/pattern",
            keyword: "pattern",
            params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
            message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
      } else {
        const err51 = {
          instancePath: instancePath + "/confirmado_em",
          schemaPath: "#/$defs/data/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      var _valid0 = _errs57 === errors;
      if (_valid0) {
        valid15 = true;
        passing0 = 0;
      }
      const _errs60 = errors;
      if (data27 !== null) {
        const err52 = {
          instancePath: instancePath + "/confirmado_em",
          schemaPath: "#/properties/confirmado_em/oneOf/1/type",
          keyword: "type",
          params: { type: "null" },
          message: "must be null",
        };
        if (vErrors === null) {
          vErrors = [err52];
        } else {
          vErrors.push(err52);
        }
        errors++;
      }
      var _valid0 = _errs60 === errors;
      if (_valid0 && valid15) {
        valid15 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid15 = true;
          passing0 = 1;
        }
      }
      if (!valid15) {
        const err53 = {
          instancePath: instancePath + "/confirmado_em",
          schemaPath: "#/properties/confirmado_em/oneOf",
          keyword: "oneOf",
          params: { passingSchemas: passing0 },
          message: "must match exactly one schema in oneOf",
        };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      } else {
        errors = _errs56;
        if (vErrors !== null) {
          if (_errs56) {
            vErrors.length = _errs56;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.confirmado_por !== undefined) {
      let data28 = data.confirmado_por;
      if (!(data28 && typeof data28 == "object" && !Array.isArray(data28)) && data28 !== null) {
        const err54 = {
          instancePath: instancePath + "/confirmado_por",
          schemaPath: "#/properties/confirmado_por/type",
          keyword: "type",
          params: { type: schema31.properties.confirmado_por.type },
          message: "must be object,null",
        };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
      if (data28 && typeof data28 == "object" && !Array.isArray(data28)) {
        for (const key3 in data28) {
          if (!(key3 === "canal" || key3 === "ref")) {
            const err55 = {
              instancePath: instancePath + "/confirmado_por",
              schemaPath: "#/properties/confirmado_por/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key3 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        if (data28.canal !== undefined) {
          let data29 = data28.canal;
          if (!(
            data29 === "painel" ||
            data29 === "email" ||
            data29 === "secretaria" ||
            data29 === "moderacao"
          )) {
            const err56 = {
              instancePath: instancePath + "/confirmado_por/canal",
              schemaPath: "#/properties/confirmado_por/properties/canal/enum",
              keyword: "enum",
              params: { allowedValues: schema31.properties.confirmado_por.properties.canal.enum },
              message: "must be equal to one of the allowed values",
            };
            if (vErrors === null) {
              vErrors = [err56];
            } else {
              vErrors.push(err56);
            }
            errors++;
          }
        }
        if (data28.ref !== undefined) {
          if (typeof data28.ref !== "string") {
            const err57 = {
              instancePath: instancePath + "/confirmado_por/ref",
              schemaPath: "#/properties/confirmado_por/properties/ref/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
        }
      }
    }
    if (data.revisao !== undefined) {
      let data31 = data.revisao;
      if (data31 && typeof data31 == "object" && !Array.isArray(data31)) {
        if (data31.pendente === undefined) {
          const err58 = {
            instancePath: instancePath + "/revisao",
            schemaPath: "#/properties/revisao/required",
            keyword: "required",
            params: { missingProperty: "pendente" },
            message: "must have required property '" + "pendente" + "'",
          };
          if (vErrors === null) {
            vErrors = [err58];
          } else {
            vErrors.push(err58);
          }
          errors++;
        }
        if (data31.motivos === undefined) {
          const err59 = {
            instancePath: instancePath + "/revisao",
            schemaPath: "#/properties/revisao/required",
            keyword: "required",
            params: { missingProperty: "motivos" },
            message: "must have required property '" + "motivos" + "'",
          };
          if (vErrors === null) {
            vErrors = [err59];
          } else {
            vErrors.push(err59);
          }
          errors++;
        }
        for (const key4 in data31) {
          if (!(key4 === "pendente" || key4 === "motivos")) {
            const err60 = {
              instancePath: instancePath + "/revisao",
              schemaPath: "#/properties/revisao/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key4 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err60];
            } else {
              vErrors.push(err60);
            }
            errors++;
          }
        }
        if (data31.pendente !== undefined) {
          if (typeof data31.pendente !== "boolean") {
            const err61 = {
              instancePath: instancePath + "/revisao/pendente",
              schemaPath: "#/properties/revisao/properties/pendente/type",
              keyword: "type",
              params: { type: "boolean" },
              message: "must be boolean",
            };
            if (vErrors === null) {
              vErrors = [err61];
            } else {
              vErrors.push(err61);
            }
            errors++;
          }
        }
        if (data31.motivos !== undefined) {
          let data33 = data31.motivos;
          if (Array.isArray(data33)) {
            const len5 = data33.length;
            for (let i5 = 0; i5 < len5; i5++) {
              if (typeof data33[i5] !== "string") {
                const err62 = {
                  instancePath: instancePath + "/revisao/motivos/" + i5,
                  schemaPath: "#/properties/revisao/properties/motivos/items/type",
                  keyword: "type",
                  params: { type: "string" },
                  message: "must be string",
                };
                if (vErrors === null) {
                  vErrors = [err62];
                } else {
                  vErrors.push(err62);
                }
                errors++;
              }
            }
          } else {
            const err63 = {
              instancePath: instancePath + "/revisao/motivos",
              schemaPath: "#/properties/revisao/properties/motivos/type",
              keyword: "type",
              params: { type: "array" },
              message: "must be array",
            };
            if (vErrors === null) {
              vErrors = [err63];
            } else {
              vErrors.push(err63);
            }
            errors++;
          }
        }
      } else {
        const err64 = {
          instancePath: instancePath + "/revisao",
          schemaPath: "#/properties/revisao/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      }
    }
  } else {
    const err65 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err65];
    } else {
      vErrors.push(err65);
    }
    errors++;
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

export const validarEntidade = validate25;
const schema48 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://missasemguimaraes.pt/schema/entidade.schema.json",
  title: "Entidade responsável por locais de culto",
  type: "object",
  additionalProperties: false,
  required: ["id", "tipo", "nome", "diocese", "locais"],
  properties: {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    tipo: {
      enum: [
        "paroquia",
        "irmandade",
        "confraria",
        "ordem-terceira",
        "misericordia",
        "ordem-religiosa",
        "santuario",
        "instituicao",
        "outro",
      ],
    },
    nome: { type: "string" },
    orago: { type: ["string", "null"] },
    arciprestado: { type: ["string", "null"] },
    diocese: { type: "string" },
    responsaveis: {
      type: "array",
      items: { type: "string" },
      description: "Pároco, reitor, juiz/provedor… (nomes públicos)",
    },
    telefones_publicos: { type: "array", items: { type: "string" } },
    email: { type: ["string", "null"] },
    site: { type: ["string", "null"] },
    locais: { type: "array", minItems: 1, items: { type: "string" } },
  },
};

function validate25(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  /*# sourceURL="https://missasemguimaraes.pt/schema/entidade.schema.json" */ let vErrors = null;
  let errors = 0;
  const evaluated0 = validate25.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.tipo === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "tipo" },
        message: "must have required property '" + "tipo" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.nome === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "nome" },
        message: "must have required property '" + "nome" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.diocese === undefined) {
      const err3 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "diocese" },
        message: "must have required property '" + "diocese" + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.locais === undefined) {
      const err4 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "locais" },
        message: "must have required property '" + "locais" + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema48.properties, key0)) {
        const err5 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err6 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/properties/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
            message: 'must match pattern "' + "^[a-z0-9]+(-[a-z0-9]+)*$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/properties/id/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.tipo !== undefined) {
      let data1 = data.tipo;
      if (!(
        data1 === "paroquia" ||
        data1 === "irmandade" ||
        data1 === "confraria" ||
        data1 === "ordem-terceira" ||
        data1 === "misericordia" ||
        data1 === "ordem-religiosa" ||
        data1 === "santuario" ||
        data1 === "instituicao" ||
        data1 === "outro"
      )) {
        const err8 = {
          instancePath: instancePath + "/tipo",
          schemaPath: "#/properties/tipo/enum",
          keyword: "enum",
          params: { allowedValues: schema48.properties.tipo.enum },
          message: "must be equal to one of the allowed values",
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.nome !== undefined) {
      if (typeof data.nome !== "string") {
        const err9 = {
          instancePath: instancePath + "/nome",
          schemaPath: "#/properties/nome/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.orago !== undefined) {
      let data3 = data.orago;
      if (typeof data3 !== "string" && data3 !== null) {
        const err10 = {
          instancePath: instancePath + "/orago",
          schemaPath: "#/properties/orago/type",
          keyword: "type",
          params: { type: schema48.properties.orago.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.arciprestado !== undefined) {
      let data4 = data.arciprestado;
      if (typeof data4 !== "string" && data4 !== null) {
        const err11 = {
          instancePath: instancePath + "/arciprestado",
          schemaPath: "#/properties/arciprestado/type",
          keyword: "type",
          params: { type: schema48.properties.arciprestado.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.diocese !== undefined) {
      if (typeof data.diocese !== "string") {
        const err12 = {
          instancePath: instancePath + "/diocese",
          schemaPath: "#/properties/diocese/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.responsaveis !== undefined) {
      let data6 = data.responsaveis;
      if (Array.isArray(data6)) {
        const len0 = data6.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (typeof data6[i0] !== "string") {
            const err13 = {
              instancePath: instancePath + "/responsaveis/" + i0,
              schemaPath: "#/properties/responsaveis/items/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/responsaveis",
          schemaPath: "#/properties/responsaveis/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.telefones_publicos !== undefined) {
      let data8 = data.telefones_publicos;
      if (Array.isArray(data8)) {
        const len1 = data8.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (typeof data8[i1] !== "string") {
            const err15 = {
              instancePath: instancePath + "/telefones_publicos/" + i1,
              schemaPath: "#/properties/telefones_publicos/items/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = {
          instancePath: instancePath + "/telefones_publicos",
          schemaPath: "#/properties/telefones_publicos/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.email !== undefined) {
      let data10 = data.email;
      if (typeof data10 !== "string" && data10 !== null) {
        const err17 = {
          instancePath: instancePath + "/email",
          schemaPath: "#/properties/email/type",
          keyword: "type",
          params: { type: schema48.properties.email.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.site !== undefined) {
      let data11 = data.site;
      if (typeof data11 !== "string" && data11 !== null) {
        const err18 = {
          instancePath: instancePath + "/site",
          schemaPath: "#/properties/site/type",
          keyword: "type",
          params: { type: schema48.properties.site.type },
          message: "must be string,null",
        };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.locais !== undefined) {
      let data12 = data.locais;
      if (Array.isArray(data12)) {
        if (data12.length < 1) {
          const err19 = {
            instancePath: instancePath + "/locais",
            schemaPath: "#/properties/locais/minItems",
            keyword: "minItems",
            params: { limit: 1 },
            message: "must NOT have fewer than 1 items",
          };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        const len2 = data12.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (typeof data12[i2] !== "string") {
            const err20 = {
              instancePath: instancePath + "/locais/" + i2,
              schemaPath: "#/properties/locais/items/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
      } else {
        const err21 = {
          instancePath: instancePath + "/locais",
          schemaPath: "#/properties/locais/type",
          keyword: "type",
          params: { type: "array" },
          message: "must be array",
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
  } else {
    const err22 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate25.errors = vErrors;
  return errors === 0;
}
validate25.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

export const validarCalendario = validate26;
const schema49 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://missasemguimaraes.pt/schema/calendario.schema.json",
  title: "Calendário litúrgico e civil (dados/calendario.yml)",
  type: "object",
  additionalProperties: false,
  required: ["dias_santos_de_preceito", "anos"],
  properties: {
    dias_santos_de_preceito: {
      type: "object",
      additionalProperties: false,
      required: ["estado", "regras"],
      properties: {
        estado: { type: "string" },
        regras: { type: "array", minItems: 1, items: { $ref: "#/$defs/regra_dia_santo" } },
        nao_incluidos: { type: "array", items: { type: "string" } },
      },
    },
    anos: {
      type: "object",
      propertyNames: { pattern: "^\\d{4}$" },
      additionalProperties: { $ref: "#/$defs/ano" },
    },
  },
  $defs: {
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    data: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    regra_dia_santo: {
      type: "object",
      additionalProperties: false,
      required: ["id", "nome"],
      description: "Exatamente um de data ou data_movel (verificado pelo motor).",
      properties: {
        id: { $ref: "#/$defs/id" },
        nome: { type: "string" },
        data: {
          type: "string",
          pattern: "^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$",
          description: "Data fixa, MM-DD",
        },
        data_movel: {
          type: "string",
          pattern: "^pascoa[+-]\\d{1,3}$",
          description: "Dias a partir da Páscoa, ex.: pascoa+60",
        },
      },
    },
    ano: {
      type: "object",
      additionalProperties: false,
      required: ["dias_santos", "moveis", "hora_legal"],
      properties: {
        dias_santos: { type: "object", additionalProperties: { $ref: "#/$defs/data" } },
        moveis: { type: "object", additionalProperties: { $ref: "#/$defs/data" } },
        hora_legal: {
          type: "object",
          additionalProperties: false,
          required: ["inicio_verao", "inicio_inverno"],
          properties: {
            inicio_verao: { $ref: "#/$defs/data" },
            inicio_inverno: { $ref: "#/$defs/data" },
          },
        },
      },
    },
  },
};
const schema50 = {
  type: "object",
  additionalProperties: false,
  required: ["id", "nome"],
  description: "Exatamente um de data ou data_movel (verificado pelo motor).",
  properties: {
    id: { $ref: "#/$defs/id" },
    nome: { type: "string" },
    data: {
      type: "string",
      pattern: "^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$",
      description: "Data fixa, MM-DD",
    },
    data_movel: {
      type: "string",
      pattern: "^pascoa[+-]\\d{1,3}$",
      description: "Dias a partir da Páscoa, ex.: pascoa+60",
    },
  },
};
const schema51 = { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" };
const pattern18 = new RegExp("^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$", "u");
const pattern19 = new RegExp("^pascoa[+-]\\d{1,3}$", "u");

function validate27(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate27.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "id" },
        message: "must have required property '" + "id" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.nome === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "nome" },
        message: "must have required property '" + "nome" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "nome" || key0 === "data" || key0 === "data_movel")) {
        const err2 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (!pattern4.test(data0)) {
          const err3 = {
            instancePath: instancePath + "/id",
            schemaPath: "#/$defs/id/pattern",
            keyword: "pattern",
            params: { pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
            message: 'must match pattern "' + "^[a-z0-9]+(-[a-z0-9]+)*$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + "/id",
          schemaPath: "#/$defs/id/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.nome !== undefined) {
      if (typeof data.nome !== "string") {
        const err5 = {
          instancePath: instancePath + "/nome",
          schemaPath: "#/properties/nome/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.data !== undefined) {
      let data2 = data.data;
      if (typeof data2 === "string") {
        if (!pattern18.test(data2)) {
          const err6 = {
            instancePath: instancePath + "/data",
            schemaPath: "#/properties/data/pattern",
            keyword: "pattern",
            params: { pattern: "^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$" },
            message: 'must match pattern "' + "^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = {
          instancePath: instancePath + "/data",
          schemaPath: "#/properties/data/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.data_movel !== undefined) {
      let data3 = data.data_movel;
      if (typeof data3 === "string") {
        if (!pattern19.test(data3)) {
          const err8 = {
            instancePath: instancePath + "/data_movel",
            schemaPath: "#/properties/data_movel/pattern",
            keyword: "pattern",
            params: { pattern: "^pascoa[+-]\\d{1,3}$" },
            message: 'must match pattern "' + "^pascoa[+-]\\d{1,3}$" + '"',
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = {
          instancePath: instancePath + "/data_movel",
          schemaPath: "#/properties/data_movel/type",
          keyword: "type",
          params: { type: "string" },
          message: "must be string",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
  } else {
    const err10 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
    }
    errors++;
  }
  validate27.errors = vErrors;
  return errors === 0;
}
validate27.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

const schema52 = {
  type: "object",
  additionalProperties: false,
  required: ["dias_santos", "moveis", "hora_legal"],
  properties: {
    dias_santos: { type: "object", additionalProperties: { $ref: "#/$defs/data" } },
    moveis: { type: "object", additionalProperties: { $ref: "#/$defs/data" } },
    hora_legal: {
      type: "object",
      additionalProperties: false,
      required: ["inicio_verao", "inicio_inverno"],
      properties: {
        inicio_verao: { $ref: "#/$defs/data" },
        inicio_inverno: { $ref: "#/$defs/data" },
      },
    },
  },
};
const schema53 = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };

function validate29(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate29.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.dias_santos === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "dias_santos" },
        message: "must have required property '" + "dias_santos" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.moveis === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "moveis" },
        message: "must have required property '" + "moveis" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.hora_legal === undefined) {
      const err2 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "hora_legal" },
        message: "must have required property '" + "hora_legal" + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "dias_santos" || key0 === "moveis" || key0 === "hora_legal")) {
        const err3 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.dias_santos !== undefined) {
      let data0 = data.dias_santos;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        for (const key1 in data0) {
          let data1 = data0[key1];
          if (typeof data1 === "string") {
            if (!pattern9.test(data1)) {
              const err4 = {
                instancePath:
                  instancePath + "/dias_santos/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
          } else {
            const err5 = {
              instancePath:
                instancePath + "/dias_santos/" + key1.replace(/~/g, "~0").replace(/\//g, "~1"),
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = {
          instancePath: instancePath + "/dias_santos",
          schemaPath: "#/properties/dias_santos/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.moveis !== undefined) {
      let data2 = data.moveis;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        for (const key2 in data2) {
          let data3 = data2[key2];
          if (typeof data3 === "string") {
            if (!pattern9.test(data3)) {
              const err7 = {
                instancePath:
                  instancePath + "/moveis/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = {
              instancePath:
                instancePath + "/moveis/" + key2.replace(/~/g, "~0").replace(/\//g, "~1"),
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = {
          instancePath: instancePath + "/moveis",
          schemaPath: "#/properties/moveis/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.hora_legal !== undefined) {
      let data4 = data.hora_legal;
      if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
        if (data4.inicio_verao === undefined) {
          const err10 = {
            instancePath: instancePath + "/hora_legal",
            schemaPath: "#/properties/hora_legal/required",
            keyword: "required",
            params: { missingProperty: "inicio_verao" },
            message: "must have required property '" + "inicio_verao" + "'",
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data4.inicio_inverno === undefined) {
          const err11 = {
            instancePath: instancePath + "/hora_legal",
            schemaPath: "#/properties/hora_legal/required",
            keyword: "required",
            params: { missingProperty: "inicio_inverno" },
            message: "must have required property '" + "inicio_inverno" + "'",
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        for (const key3 in data4) {
          if (!(key3 === "inicio_verao" || key3 === "inicio_inverno")) {
            const err12 = {
              instancePath: instancePath + "/hora_legal",
              schemaPath: "#/properties/hora_legal/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key3 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data4.inicio_verao !== undefined) {
          let data5 = data4.inicio_verao;
          if (typeof data5 === "string") {
            if (!pattern9.test(data5)) {
              const err13 = {
                instancePath: instancePath + "/hora_legal/inicio_verao",
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = {
              instancePath: instancePath + "/hora_legal/inicio_verao",
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data4.inicio_inverno !== undefined) {
          let data6 = data4.inicio_inverno;
          if (typeof data6 === "string") {
            if (!pattern9.test(data6)) {
              const err15 = {
                instancePath: instancePath + "/hora_legal/inicio_inverno",
                schemaPath: "#/$defs/data/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
                message: 'must match pattern "' + "^\\d{4}-\\d{2}-\\d{2}$" + '"',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = {
              instancePath: instancePath + "/hora_legal/inicio_inverno",
              schemaPath: "#/$defs/data/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
      } else {
        const err17 = {
          instancePath: instancePath + "/hora_legal",
          schemaPath: "#/properties/hora_legal/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
  } else {
    const err18 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
    }
    errors++;
  }
  validate29.errors = vErrors;
  return errors === 0;
}
validate29.evaluated = { props: true, dynamicProps: false, dynamicItems: false };

const pattern20 = new RegExp("^\\d{4}$", "u");

function validate26(
  data,
  { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {},
) {
  /*# sourceURL="https://missasemguimaraes.pt/schema/calendario.schema.json" */ let vErrors = null;
  let errors = 0;
  const evaluated0 = validate26.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = undefined;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = undefined;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.dias_santos_de_preceito === undefined) {
      const err0 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "dias_santos_de_preceito" },
        message: "must have required property '" + "dias_santos_de_preceito" + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.anos === undefined) {
      const err1 = {
        instancePath,
        schemaPath: "#/required",
        keyword: "required",
        params: { missingProperty: "anos" },
        message: "must have required property '" + "anos" + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "dias_santos_de_preceito" || key0 === "anos")) {
        const err2 = {
          instancePath,
          schemaPath: "#/additionalProperties",
          keyword: "additionalProperties",
          params: { additionalProperty: key0 },
          message: "must NOT have additional properties",
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.dias_santos_de_preceito !== undefined) {
      let data0 = data.dias_santos_de_preceito;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.estado === undefined) {
          const err3 = {
            instancePath: instancePath + "/dias_santos_de_preceito",
            schemaPath: "#/properties/dias_santos_de_preceito/required",
            keyword: "required",
            params: { missingProperty: "estado" },
            message: "must have required property '" + "estado" + "'",
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data0.regras === undefined) {
          const err4 = {
            instancePath: instancePath + "/dias_santos_de_preceito",
            schemaPath: "#/properties/dias_santos_de_preceito/required",
            keyword: "required",
            params: { missingProperty: "regras" },
            message: "must have required property '" + "regras" + "'",
          };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "estado" || key1 === "regras" || key1 === "nao_incluidos")) {
            const err5 = {
              instancePath: instancePath + "/dias_santos_de_preceito",
              schemaPath: "#/properties/dias_santos_de_preceito/additionalProperties",
              keyword: "additionalProperties",
              params: { additionalProperty: key1 },
              message: "must NOT have additional properties",
            };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data0.estado !== undefined) {
          if (typeof data0.estado !== "string") {
            const err6 = {
              instancePath: instancePath + "/dias_santos_de_preceito/estado",
              schemaPath: "#/properties/dias_santos_de_preceito/properties/estado/type",
              keyword: "type",
              params: { type: "string" },
              message: "must be string",
            };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data0.regras !== undefined) {
          let data2 = data0.regras;
          if (Array.isArray(data2)) {
            if (data2.length < 1) {
              const err7 = {
                instancePath: instancePath + "/dias_santos_de_preceito/regras",
                schemaPath: "#/properties/dias_santos_de_preceito/properties/regras/minItems",
                keyword: "minItems",
                params: { limit: 1 },
                message: "must NOT have fewer than 1 items",
              };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (
                !validate27(data2[i0], {
                  instancePath: instancePath + "/dias_santos_de_preceito/regras/" + i0,
                  parentData: data2,
                  parentDataProperty: i0,
                  rootData,
                  dynamicAnchors,
                })
              ) {
                vErrors = vErrors === null ? validate27.errors : vErrors.concat(validate27.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err8 = {
              instancePath: instancePath + "/dias_santos_de_preceito/regras",
              schemaPath: "#/properties/dias_santos_de_preceito/properties/regras/type",
              keyword: "type",
              params: { type: "array" },
              message: "must be array",
            };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data0.nao_incluidos !== undefined) {
          let data4 = data0.nao_incluidos;
          if (Array.isArray(data4)) {
            const len1 = data4.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (typeof data4[i1] !== "string") {
                const err9 = {
                  instancePath: instancePath + "/dias_santos_de_preceito/nao_incluidos/" + i1,
                  schemaPath:
                    "#/properties/dias_santos_de_preceito/properties/nao_incluidos/items/type",
                  keyword: "type",
                  params: { type: "string" },
                  message: "must be string",
                };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            }
          } else {
            const err10 = {
              instancePath: instancePath + "/dias_santos_de_preceito/nao_incluidos",
              schemaPath: "#/properties/dias_santos_de_preceito/properties/nao_incluidos/type",
              keyword: "type",
              params: { type: "array" },
              message: "must be array",
            };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
      } else {
        const err11 = {
          instancePath: instancePath + "/dias_santos_de_preceito",
          schemaPath: "#/properties/dias_santos_de_preceito/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.anos !== undefined) {
      let data6 = data.anos;
      if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
        for (const key2 in data6) {
          const _errs16 = errors;
          if (typeof key2 === "string") {
            if (!pattern20.test(key2)) {
              const err12 = {
                instancePath: instancePath + "/anos",
                schemaPath: "#/properties/anos/propertyNames/pattern",
                keyword: "pattern",
                params: { pattern: "^\\d{4}$" },
                message: 'must match pattern "' + "^\\d{4}$" + '"',
                propertyName: key2,
              };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          }
          var valid6 = _errs16 === errors;
          if (!valid6) {
            const err13 = {
              instancePath: instancePath + "/anos",
              schemaPath: "#/properties/anos/propertyNames",
              keyword: "propertyNames",
              params: { propertyName: key2 },
              message: "property name must be valid",
            };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        for (const key3 in data6) {
          if (
            !validate29(data6[key3], {
              instancePath: instancePath + "/anos/" + key3.replace(/~/g, "~0").replace(/\//g, "~1"),
              parentData: data6,
              parentDataProperty: key3,
              rootData,
              dynamicAnchors,
            })
          ) {
            vErrors = vErrors === null ? validate29.errors : vErrors.concat(validate29.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err14 = {
          instancePath: instancePath + "/anos",
          schemaPath: "#/properties/anos/type",
          keyword: "type",
          params: { type: "object" },
          message: "must be object",
        };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
  } else {
    const err15 = {
      instancePath,
      schemaPath: "#/type",
      keyword: "type",
      params: { type: "object" },
      message: "must be object",
    };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  }
  validate26.errors = vErrors;
  return errors === 0;
}
validate26.evaluated = { props: true, dynamicProps: false, dynamicItems: false };
